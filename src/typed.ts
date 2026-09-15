import { describeValue, invalid, isAppexError } from './errors';
import { createOccurrence, installCause } from './occurrence';
import {
  TYPED_EXCEPTION_BRAND,
  isLocalTypedException,
  registerTypedException,
} from './typed-internals';
import type { PublicPolicyRecord } from './typed-internals';

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

/** The frozen details record an occurrence exposes. `never` selects the empty record of a constant-message kind. */
export type DetailsRecord<Details extends object> = [Details] extends [never]
  ? Readonly<Record<string, never>>
  : Readonly<RecordDetails<Details>>;

/**
 * What `toPublicReport` discloses for occurrences of a kind.
 *
 * `code` is the value an agent branches on. `message` is display text, constant
 * or rendered from the details. `details` selects the JSON that becomes
 * `as_json`; return only what the audience may see.
 */
export type PublicPolicy<Details extends object = never> = {
  readonly code: string;
  readonly message?: string | ((details: DetailsRecord<Details>) => string);
  readonly details?: (details: DetailsRecord<Details>) => unknown;
};

/** Constructor input. Omitting `Details` selects the constant-message form, whose input is optional. */
export type ExceptionInput<Details extends object = never> = ([
  Details,
] extends [never]
  ? { readonly details?: Record<string, never> }
  : { readonly details: RecordDetails<Details> }) &
  (NoCause | SingleCause | MultipleCauses);

/** Input of `defineException`. A string `message` defines a kind without details. */
export type ExceptionDefinition<
  Tag extends string,
  Details extends object = never,
> = {
  readonly tag: Tag;
  readonly message: [Details] extends [never]
    ? string
    : (details: Readonly<RecordDetails<Details>>) => string;
  readonly idPrefix?: string;
  readonly public?: PublicPolicy<Details>;
};

/** One occurrence: a native `Error` with a stable `_tag`, an `occurrenceId` used as the report `occurrence_id`, and frozen `details`. */
export interface TypedException<
  Tag extends string = string,
  Details extends object = object,
> extends Error {
  readonly _tag: Tag;
  readonly occurrenceId: string;
  readonly timestamp: string;
  readonly details: DetailsRecord<Details>;
  readonly cause?: unknown;
  readonly [TYPED_EXCEPTION_BRAND]: true;
}

/** The constructor `defineException` returns. `tag` is the kind's tag. */
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

function isNonArrayObject<Value>(value: Value): value is Value & object {
  try {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  } catch {
    return false;
  }
}

function readDetailsOption(options: {
  readonly details?: object;
}): object | undefined {
  try {
    return options.details;
  } catch {
    throw invalid('APPEX_INVALID_DETAILS', 'details could not be inspected');
  }
}

function copyRecordDetails(
  value: object,
): Readonly<Record<PropertyKey, unknown>> {
  try {
    let prototype = Object.getPrototypeOf(value) as object | null;
    let depth = 0;
    while (prototype !== null && prototype !== Object.prototype) {
      if (++depth > 32)
        throw invalid(
          'APPEX_INVALID_DETAILS',
          'details prototype chain exceeds 32 levels',
        );
      if (Reflect.ownKeys(prototype).some((key) => key !== 'constructor')) {
        throw invalid(
          'APPEX_INVALID_DETAILS',
          'details must have a data-only object prototype',
        );
      }
      prototype = Object.getPrototypeOf(prototype) as object | null;
    }

    const output: Record<PropertyKey, unknown> = {};
    const keys = Reflect.ownKeys(value);
    if (keys.length > 1_000)
      throw invalid('APPEX_INVALID_DETAILS', 'details exceed 1,000 own keys');
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor ||
        !descriptor.enumerable ||
        !('value' in descriptor) ||
        typeof descriptor.value === 'function'
      ) {
        throw invalid(
          'APPEX_INVALID_DETAILS',
          'details must contain only enumerable data properties',
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
  } catch (failure: unknown) {
    if (isAppexError(failure)) throw failure;
    throw invalid('APPEX_INVALID_DETAILS', 'details could not be inspected');
  }
}

function renderMessage(
  tag: string,
  message: string | ((details: object) => string),
  details: object,
): string {
  try {
    const rendered = typeof message === 'string' ? message : message(details);
    if (typeof rendered === 'string') return rendered;
    return `${tag} [message rendering failed: renderer returned ${typeof rendered}]`;
  } catch (failure: unknown) {
    return `${tag} [message rendering failed: ${describeValue(failure)}]`;
  }
}

function validatePublicPolicy(policy: unknown): PublicPolicyRecord | undefined {
  if (policy === undefined) return undefined;
  if (typeof policy !== 'object' || policy === null || Array.isArray(policy))
    throw invalid('APPEX_INVALID_PUBLIC_POLICY', 'public must be an object');
  const { code, message, details } = policy as Record<string, unknown>;
  if (typeof code !== 'string' || code.length === 0 || code.length > 128)
    throw invalid(
      'APPEX_INVALID_PUBLIC_POLICY',
      'public.code must be a nonempty string of at most 128 characters',
    );
  if (
    message !== undefined &&
    typeof message !== 'string' &&
    typeof message !== 'function'
  )
    throw invalid(
      'APPEX_INVALID_PUBLIC_POLICY',
      'public.message must be a string or a function',
    );
  if (details !== undefined && typeof details !== 'function')
    throw invalid(
      'APPEX_INVALID_PUBLIC_POLICY',
      'public.details must be a function',
    );
  const record: {
    code: string;
    message?: NonNullable<PublicPolicyRecord['message']>;
    details?: NonNullable<PublicPolicyRecord['details']>;
  } = { code };
  if (message !== undefined)
    record.message = message as NonNullable<PublicPolicyRecord['message']>;
  if (details !== undefined)
    record.details = details as NonNullable<PublicPolicyRecord['details']>;
  return record;
}

/**
 * Define an error kind: a native `Error` subclass with a stable `_tag`, typed
 * `details`, an `occurrenceId`, and an optional `public` disclosure policy.
 *
 * Annotate the message renderer's parameter to declare the details type. A
 * string message defines a kind without details. Details must be a data-only
 * record: no arrays, functions, accessors, or methods.
 *
 * @throws `APPEX_INVALID_TAG`, `APPEX_INVALID_MESSAGE`, `APPEX_INVALID_ID_PREFIX`, `APPEX_INVALID_PUBLIC_POLICY`
 * @example
 * ```ts
 * import { defineException } from 'application-exception';
 * const ToolUnavailable = defineException({
 *   tag: 'tools/Unavailable', message: ({ tool }: { tool: string }) => `Tool ${tool} is unavailable`,
 *   public: { code: 'TOOL_UNAVAILABLE', message: 'The tool is unavailable.', details: ({ tool }) => ({ tool }) },
 * });
 * const error = new ToolUnavailable({ details: { tool: 'search' }, cause: new Error('refused') });
 * console.log(error._tag, error.details.tool); // 'tools/Unavailable' 'search'
 * ```
 */
export function defineException<Tag extends string>(
  definition: ExceptionDefinition<Tag>,
): TypedExceptionClass<Tag>;
export function defineException<Tag extends string, Details extends object>(
  definition: {
    readonly tag: Tag;
    readonly message: (details: Details) => string;
    readonly idPrefix?: string;
    readonly public?: PublicPolicy<Details>;
  } & ([RecordDetails<Details>] extends [never] ? never : unknown),
): TypedExceptionClass<Tag, Details>;
export function defineException(definition: {
  readonly tag: string;
  readonly message: string | ((details: never) => string);
  readonly idPrefix?: string;
  readonly public?: unknown;
}): unknown {
  const { tag, message, idPrefix } = definition;
  if (typeof tag !== 'string' || tag.trim().length === 0 || tag.length > 128) {
    throw invalid(
      'APPEX_INVALID_TAG',
      'tag must be a nonempty string of at most 128 characters',
    );
  }
  if (typeof message !== 'function' && typeof message !== 'string') {
    throw invalid(
      'APPEX_INVALID_MESSAGE',
      'message must be a string or a function',
    );
  }
  if (
    idPrefix !== undefined &&
    (typeof idPrefix !== 'string' ||
      idPrefix.trim().length === 0 ||
      idPrefix.length > 32)
  ) {
    throw invalid(
      'APPEX_INVALID_ID_PREFIX',
      'idPrefix must be a nonempty string of at most 32 characters',
    );
  }
  const policy = validatePublicPolicy(definition.public);

  class DefinedException extends Error {
    static readonly tag = tag;
    readonly _tag: string;
    readonly occurrenceId: string;
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
      if (!isNonArrayObject(options)) {
        throw invalid(
          'APPEX_INVALID_DETAILS',
          'details must be a non-array object',
        );
      }
      const provided = readDetailsOption(options);
      const suppliedDetails =
        provided === undefined && typeof message === 'string' ? {} : provided;
      if (!isNonArrayObject(suppliedDetails)) {
        throw invalid(
          'APPEX_INVALID_DETAILS',
          'details must be a non-array object',
        );
      }
      const details = copyRecordDetails(suppliedDetails);
      super(
        renderMessage(
          tag,
          message as string | ((details: object) => string),
          details,
        ),
      );
      const occurrence = createOccurrence(idPrefix);
      this._tag = tag;
      this.occurrenceId = occurrence.id;
      this.timestamp = occurrence.timestamp;
      this.details = details;
      installCause(this, options);
      registerTypedException(this, policy);
    }
  }
  Object.defineProperty(DefinedException, 'name', {
    value: tag,
    configurable: true,
  });
  Object.defineProperty(DefinedException.prototype, 'name', {
    value: tag,
    writable: true,
    configurable: true,
  });
  return DefinedException;
}

/**
 * Whether a value is an occurrence created by this loaded copy of the package.
 * Narrow a specific kind with `instanceof` before reading its details.
 *
 * @example
 * ```ts
 * import { defineException, isTypedException } from 'application-exception';
 * const Unavailable = defineException({ tag: 'app/Unavailable', message: 'Unavailable' });
 * const caught: unknown = new Unavailable();
 * if (isTypedException(caught)) console.log(caught._tag, caught.occurrenceId);
 * if (caught instanceof Unavailable) console.log(caught.details);
 * ```
 */
export function isTypedException(value: unknown): value is TypedException {
  return isLocalTypedException(value);
}
