/** Internal metadata is a diagnostic hint, never a remote detail-schema guard. */
export const TYPED_EXCEPTION_BRAND = Symbol.for(
  'application-exception/TypedException',
);
const MESSAGE_RENDERING_FAILURE = Symbol.for(
  'application-exception/message-rendering-failure',
);
const instances = new WeakSet<object>();

export type MessageRenderingFailure =
  | { readonly present: false }
  | { readonly present: true; readonly value: unknown };

export function registerTypedException(
  error: object,
  failure: MessageRenderingFailure,
): void {
  instances.add(error);
  if (failure.present) {
    Object.defineProperty(error, MESSAGE_RENDERING_FAILURE, {
      value: Object.freeze(failure),
    });
  }
}

export function isLocalTypedException(value: unknown): boolean {
  return typeof value === 'object' && value !== null && instances.has(value);
}

function ownData(value: object, key: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

export function getMessageRenderingFailure(
  value: unknown,
): MessageRenderingFailure {
  try {
    if (typeof value !== 'object' || value === null) return { present: false };
    const failure: unknown = ownData(value, MESSAGE_RENDERING_FAILURE);
    if (
      typeof failure !== 'object' ||
      failure === null ||
      ownData(failure, 'present') !== true
    ) {
      return { present: false };
    }
    return { present: true, value: ownData(failure, 'value') };
  } catch {
    return { present: false };
  }
}

export interface TypedExceptionView {
  readonly tag: string;
  readonly id: string;
  readonly timestamp: string;
  readonly details: object;
}

export function getTypedExceptionView(
  value: unknown,
): TypedExceptionView | undefined {
  try {
    if (
      typeof value !== 'object' ||
      value === null ||
      ownData(value, TYPED_EXCEPTION_BRAND) !== true
    )
      return undefined;
    const tag = ownData(value, '_tag');
    const id = ownData(value, 'id');
    const timestamp = ownData(value, 'timestamp');
    const details = ownData(value, 'details');
    if (
      typeof tag !== 'string' ||
      tag.trim().length === 0 ||
      tag.length > 128 ||
      typeof id !== 'string' ||
      id.trim().length === 0 ||
      id.length > 128 ||
      typeof timestamp !== 'string' ||
      timestamp.length > 128 ||
      !Number.isFinite(Date.parse(timestamp)) ||
      typeof details !== 'object' ||
      details === null ||
      Array.isArray(details)
    )
      return undefined;
    return { tag, id, timestamp, details };
  } catch {
    return undefined;
  }
}
