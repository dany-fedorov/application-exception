import { createOccurrence, installCause } from './occurrence';

const TYPED_EXCEPTION_BRAND = Symbol.for(
  'application-exception/TypedException',
);
const MESSAGE_RENDERING_ERROR = Symbol(
  'application-exception/message-rendering-error',
);

type NoCause = {
  readonly cause?: never;
  readonly causes?: never;
};

type SingleCause = {
  readonly cause: unknown;
  readonly causes?: never;
};

type MultipleCauses = {
  readonly cause?: never;
  readonly causes: readonly unknown[];
};

export type ExceptionInput<Details extends Record<string, unknown>> = {
  readonly details: Details;
} & (NoCause | SingleCause | MultipleCauses);

export type ExceptionDefinition<
  Tag extends string,
  Details extends Record<string, unknown>,
> = {
  readonly tag: Tag;
  readonly message: (details: Readonly<Details>) => string;
  readonly idPrefix?: string;
};

export interface TypedException<
  Tag extends string = string,
  Details extends Record<string, unknown> = Record<string, unknown>,
> extends Error {
  readonly _tag: Tag;
  readonly id: string;
  readonly timestamp: string;
  readonly details: Readonly<Details>;
  readonly cause?: unknown;
  readonly [TYPED_EXCEPTION_BRAND]: true;
  readonly [MESSAGE_RENDERING_ERROR]?: unknown;
}

export type TypedExceptionClass<
  Tag extends string,
  Details extends Record<string, unknown>,
> = {
  new (input: ExceptionInput<Details>): TypedException<Tag, Details>;
  readonly tag: Tag;
};

function renderMessage<Details extends Record<string, unknown>>(
  tag: string,
  renderer: (details: Readonly<Details>) => string,
  details: Readonly<Details>,
): { readonly message: string; readonly error?: unknown } {
  try {
    const message = renderer(details);
    if (typeof message !== 'string') {
      return {
        message: tag,
        error: new TypeError('Exception message renderer must return a string'),
      };
    }
    return { message };
  } catch (error: unknown) {
    return { message: tag, error };
  }
}

export function defineException<Details extends Record<string, unknown>>(): <
  Tag extends string,
>(
  definition: ExceptionDefinition<Tag, Details>,
) => TypedExceptionClass<Tag, Details> {
  return <Tag extends string>(
    definition: ExceptionDefinition<Tag, Details>,
  ) => {
    class DefinedException extends Error {
      static readonly tag: Tag = definition.tag;

      readonly _tag: Tag;
      readonly id: string;
      readonly timestamp: string;
      readonly details: Readonly<Details>;
      readonly cause?: unknown;
      readonly [TYPED_EXCEPTION_BRAND] = true as const;
      readonly [MESSAGE_RENDERING_ERROR]?: unknown;

      constructor(input: ExceptionInput<Details>) {
        if (
          Object.prototype.hasOwnProperty.call(input, 'cause') &&
          Object.prototype.hasOwnProperty.call(input, 'causes')
        ) {
          throw new TypeError('Provide either cause or causes, not both');
        }
        const details = Object.freeze({
          ...input.details,
        }) as Readonly<Details>;
        const rendered = renderMessage(
          definition.tag,
          definition.message,
          details,
        );
        super(rendered.message);

        const occurrence = createOccurrence(definition.idPrefix);
        this.name = definition.tag;
        this._tag = definition.tag;
        this.id = occurrence.id;
        this.timestamp = occurrence.timestamp;
        this.details = details;
        if (Object.prototype.hasOwnProperty.call(rendered, 'error')) {
          this[MESSAGE_RENDERING_ERROR] = rendered.error;
        }
        installCause(this, input);
        Object.setPrototypeOf(this, new.target.prototype);
      }
    }

    Object.defineProperty(DefinedException, 'name', {
      value: definition.tag,
      configurable: true,
    });

    return DefinedException as unknown as TypedExceptionClass<Tag, Details>;
  };
}

export function isTypedException(value: unknown): value is TypedException {
  try {
    return (
      typeof value === 'object' &&
      value !== null &&
      (value as { readonly [TYPED_EXCEPTION_BRAND]?: unknown })[
        TYPED_EXCEPTION_BRAND
      ] === true
    );
  } catch (_error: unknown) {
    return false;
  }
}

export function getMessageRenderingError(error: TypedException): unknown {
  return error[MESSAGE_RENDERING_ERROR];
}
