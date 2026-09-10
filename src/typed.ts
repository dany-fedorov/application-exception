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

type FunctionPropertyKeys<Details extends object> = {
  [Key in keyof Details]-?: [Details[Key]] extends [never]
    ? never
    : NonNullable<Details[Key]> extends (...args: never[]) => unknown
    ? Key
    : never;
}[keyof Details];

type RecordDetails<Details extends object> = Details extends
  | readonly unknown[]
  | ((...args: never[]) => unknown)
  ? never
  : [FunctionPropertyKeys<Details>] extends [never]
  ? Details
  : never;

function copyRecordDetails(
  value: object,
): Readonly<Record<PropertyKey, unknown>> {
  try {
    let prototype = Object.getPrototypeOf(value) as object | null;
    while (prototype !== null && prototype !== Object.prototype) {
      const descriptors = Object.getOwnPropertyDescriptors(prototype);
      if (Reflect.ownKeys(descriptors).some((key) => key !== 'constructor')) {
        throw new TypeError(
          'Exception details must have a data-only object prototype',
        );
      }
      prototype = Object.getPrototypeOf(prototype) as object | null;
    }

    const output: Record<PropertyKey, unknown> = {};
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = Reflect.get(descriptors, key) as
        | PropertyDescriptor
        | undefined;
      if (
        !descriptor ||
        !descriptor.enumerable ||
        !('value' in descriptor) ||
        typeof descriptor.value === 'function'
      ) {
        throw new TypeError(
          'Exception details must contain enumerable data properties',
        );
      }
      Object.defineProperty(output, key, {
        value: descriptor.value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return Object.freeze(output);
  } catch (_error: unknown) {
    if (_error instanceof TypeError) throw _error;
    throw new TypeError('Exception details could not be inspected');
  }
}

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
  ..._invalidDetails: [RecordDetails<Details>] extends [never]
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
        if (
          Object.prototype.hasOwnProperty.call(input, 'cause') &&
          Object.prototype.hasOwnProperty.call(input, 'causes')
        ) {
          throw new TypeError('Provide either cause or causes, not both');
        }
        const details = copyRecordDetails(suppliedDetails) as Readonly<
          RecordDetails<Details>
        >;
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
