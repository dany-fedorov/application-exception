import { createOccurrence, installCause } from './occurrence';

const TYPED_EXCEPTION_BRAND = Symbol.for(
  'application-exception/TypedException',
);
const MESSAGE_RENDERING_ERROR = Symbol(
  'application-exception/message-rendering-error',
);
const typedExceptionInstances = new WeakSet<object>();

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

type NonRecordDetails =
  | readonly unknown[]
  | ((...args: never[]) => unknown)
  | Date
  | RegExp
  | Error
  | Promise<unknown>
  | ReadonlyMap<unknown, unknown>
  | ReadonlySet<unknown>;

type RecordDetails<Details extends object> = Details extends NonRecordDetails
  ? never
  : Details;

export type ExceptionInput<Details extends object> = {
  readonly details: RecordDetails<Details>;
} & (NoCause | SingleCause | MultipleCauses);

export type ExceptionDefinition<Tag extends string, Details extends object> = {
  readonly tag: Tag;
  readonly message: (details: Readonly<RecordDetails<Details>>) => string;
  readonly idPrefix?: string;
};

export interface TypedException<
  Tag extends string = string,
  Details extends object = Record<string, unknown>,
> extends Error {
  readonly _tag: Tag;
  readonly id: string;
  readonly timestamp: string;
  readonly details: Readonly<RecordDetails<Details>>;
  readonly cause?: unknown;
  readonly [TYPED_EXCEPTION_BRAND]: true;
  readonly [MESSAGE_RENDERING_ERROR]?: unknown;
}

export type TypedExceptionClass<Tag extends string, Details extends object> = {
  new (input: ExceptionInput<Details>): TypedException<Tag, Details>;
  readonly tag: Tag;
};

function renderMessage<Details extends object>(
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

export function defineException<Details extends object>(
  ..._invalidDetails: Details extends NonRecordDetails
    ? [reason: 'Details must be a record-like object']
    : []
): <Tag extends string>(
  definition: ExceptionDefinition<Tag, Details>,
) => TypedExceptionClass<Tag, Details> {
  void _invalidDetails;
  return <Tag extends string>(
    definition: ExceptionDefinition<Tag, Details>,
  ) => {
    if (
      typeof definition?.tag !== 'string' ||
      definition.tag.trim().length === 0
    ) {
      throw new TypeError('Exception tag must be a non-empty string');
    }
    if (typeof definition.message !== 'function') {
      throw new TypeError('Exception message must be a function');
    }

    class DefinedException extends Error {
      static readonly tag: Tag = definition.tag;

      readonly _tag: Tag;
      readonly id: string;
      readonly timestamp: string;
      readonly details: Readonly<RecordDetails<Details>>;
      readonly cause?: unknown;
      readonly [TYPED_EXCEPTION_BRAND] = true as const;
      readonly [MESSAGE_RENDERING_ERROR]?: unknown;

      constructor(input: ExceptionInput<Details>) {
        const suppliedDetails = (
          input as { readonly details?: unknown } | null | undefined
        )?.details;
        if (
          typeof suppliedDetails !== 'object' ||
          suppliedDetails === null ||
          Array.isArray(suppliedDetails)
        ) {
          throw new TypeError('Exception details must be a non-array object');
        }
        let detailsPrototype: object | null;
        try {
          detailsPrototype = Object.getPrototypeOf(suppliedDetails) as
            | object
            | null;
        } catch (_error: unknown) {
          throw new TypeError('Exception details must be a plain object');
        }
        if (
          detailsPrototype !== Object.prototype &&
          detailsPrototype !== null
        ) {
          throw new TypeError('Exception details must be a plain object');
        }
        if (
          Object.prototype.hasOwnProperty.call(input, 'cause') &&
          Object.prototype.hasOwnProperty.call(input, 'causes')
        ) {
          throw new TypeError('Provide either cause or causes, not both');
        }
        const details = Object.freeze({
          ...suppliedDetails,
        }) as Readonly<RecordDetails<Details>>;
        const rendered = renderMessage(
          definition.tag,
          definition.message,
          details,
        );
        super(rendered.message);

        const occurrence = createOccurrence(definition.idPrefix);
        this.name = definition.tag;
        const capturedStack = this.stack;
        if (typeof capturedStack === 'string') {
          Object.defineProperty(this, 'stack', {
            value: capturedStack,
            configurable: true,
            writable: true,
          });
        }
        this._tag = definition.tag;
        this.id = occurrence.id;
        this.timestamp = occurrence.timestamp;
        this.details = details;
        if (Object.prototype.hasOwnProperty.call(rendered, 'error')) {
          this[MESSAGE_RENDERING_ERROR] = rendered.error;
        }
        installCause(this, input);
        Object.setPrototypeOf(this, new.target.prototype);
        typedExceptionInstances.add(this);
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
      typedExceptionInstances.has(value)
    );
  } catch (_error: unknown) {
    return false;
  }
}

export function getMessageRenderingError(error: TypedException): unknown {
  return error[MESSAGE_RENDERING_ERROR];
}
