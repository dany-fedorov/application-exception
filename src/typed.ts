import { createOccurrence, installCause } from './occurrence';
import {
  TYPED_EXCEPTION_BRAND,
  isLocalTypedException,
  registerTypedException,
  MessageRenderingFailure,
} from './typed-internals';

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
    let depth = 0;
    while (prototype !== null && prototype !== Object.prototype) {
      if (++depth > 32)
        throw new TypeError('Exception details prototype exceeds 32 levels');
      if (Reflect.ownKeys(prototype).some((key) => key !== 'constructor')) {
        throw new TypeError(
          'Exception details must have a data-only object prototype',
        );
      }
      prototype = Object.getPrototypeOf(prototype) as object | null;
    }

    const output: Record<PropertyKey, unknown> = {};
    const keys = Reflect.ownKeys(value);
    if (keys.length > 1_000)
      throw new TypeError('Exception details exceed 1,000 own keys');
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
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

/** Omitting Details selects the constant-message, optional-input form. */
export type ExceptionInput<Details extends object = never> = ([
  Details,
] extends [never]
  ? { readonly details?: Record<string, never> }
  : { readonly details: RecordDetails<Details> }) &
  (NoCause | SingleCause | MultipleCauses);

export type ExceptionDefinition<
  Tag extends string,
  Details extends object = never,
> = {
  readonly tag: Tag;
  readonly message: [Details] extends [never]
    ? string
    : (details: Readonly<RecordDetails<Details>>) => string;
  readonly idPrefix?: string;
};

export interface TypedException<
  Tag extends string = string,
  Details extends object = object,
> extends Error {
  readonly _tag: Tag;
  readonly id: string;
  readonly timestamp: string;
  readonly details: [Details] extends [never]
    ? Readonly<Record<string, never>>
    : Readonly<RecordDetails<Details>>;
  readonly cause?: unknown;
  readonly [TYPED_EXCEPTION_BRAND]: true;
}

export type TypedExceptionClass<
  Tag extends string,
  Details extends object = never,
> = {
  new (
    ...args: [Details] extends [never]
      ? [input?: ExceptionInput]
      : [input: ExceptionInput<Details>]
  ): TypedException<Tag, Details>;
  readonly tag: Tag;
};

function renderMessage(
  tag: string,
  message: string | ((details: object) => string),
  details: object,
): {
  readonly message: string;
  readonly failure: MessageRenderingFailure;
} {
  try {
    const rendered = typeof message === 'string' ? message : message(details);
    if (typeof rendered !== 'string')
      throw new TypeError('Exception message renderer must return a string');
    return { message: rendered, failure: { present: false } };
  } catch (value: unknown) {
    return { message: tag, failure: { present: true, value } };
  }
}

export function defineException<Tag extends string>(
  definition: ExceptionDefinition<Tag>,
): TypedExceptionClass<Tag>;
export function defineException<Tag extends string, Details extends object>(
  definition: {
    readonly tag: Tag;
    readonly message: (details: Details) => string;
    readonly idPrefix?: string;
  } & ([RecordDetails<Details>] extends [never] ? never : unknown),
): TypedExceptionClass<Tag, Details>;
export function defineException(definition: {
  readonly tag: string;
  readonly message: string | ((details: never) => string);
  readonly idPrefix?: string;
}): unknown {
  const { tag, message, idPrefix } = definition;
  if (typeof tag !== 'string' || tag.trim().length === 0 || tag.length > 128) {
    throw new TypeError(
      'Exception tag must be a non-empty string of at most 128 characters',
    );
  }
  if (typeof message !== 'function' && typeof message !== 'string') {
    throw new TypeError('Exception message must be a string or function');
  }
  if (
    idPrefix !== undefined &&
    (typeof idPrefix !== 'string' ||
      idPrefix.trim().length === 0 ||
      idPrefix.length > 32)
  ) {
    throw new TypeError(
      'Exception ID prefix must be a non-empty string of at most 32 characters',
    );
  }

  class DefinedException extends Error {
    static readonly tag = tag;
    readonly _tag: string;
    readonly id: string;
    readonly timestamp: string;
    readonly details: Readonly<Record<PropertyKey, unknown>>;
    declare readonly cause?: unknown;
    readonly [TYPED_EXCEPTION_BRAND] = true as const;

    constructor(input?: {
      readonly details?: object;
      readonly cause?: unknown;
      readonly causes?: readonly unknown[];
    }) {
      const options =
        input === undefined && typeof message === 'string' ? {} : input;
      const suppliedDetails =
        options?.details === undefined && typeof message === 'string'
          ? {}
          : options?.details;
      if (
        typeof options !== 'object' ||
        options === null ||
        Array.isArray(options) ||
        typeof suppliedDetails !== 'object' ||
        suppliedDetails === null ||
        Array.isArray(suppliedDetails)
      ) {
        throw new TypeError('Exception details must be a non-array object');
      }
      const details = copyRecordDetails(suppliedDetails);
      const rendered = renderMessage(
        tag,
        message as string | ((details: object) => string),
        details,
      );
      super(rendered.message);
      const occurrence = createOccurrence(idPrefix);
      this.name = tag;
      this._tag = tag;
      this.id = occurrence.id;
      this.timestamp = occurrence.timestamp;
      this.details = details;
      installCause(this, options);
      registerTypedException(this, rendered.failure);
    }
  }
  Object.defineProperty(DefinedException, 'name', {
    value: tag,
    configurable: true,
  });
  return DefinedException;
}

/** Narrows instances created by this loaded copy of the library only. */
export function isTypedException(value: unknown): value is TypedException {
  return isLocalTypedException(value);
}
