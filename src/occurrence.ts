import { customAlphabet } from 'nanoid';
import { invalid } from './errors';

const makeOccurrenceIdBody = customAlphabet(
  '0123456789ABCDEFGHJKMNPQRSTVWXYZ',
  26,
);

export interface Occurrence {
  readonly id: string;
  readonly timestamp: string;
}

export function createOccurrence(idPrefix = 'AE_'): Occurrence {
  return {
    id: `${idPrefix}${makeOccurrenceIdBody()}`,
    timestamp: new Date().toISOString(),
  };
}

export function installCause(
  target: Error,
  input: { readonly cause?: unknown; readonly causes?: readonly unknown[] },
): void {
  const hasCause = Object.prototype.hasOwnProperty.call(input, 'cause');
  const hasCauses = Object.prototype.hasOwnProperty.call(input, 'causes');
  if (hasCause && hasCauses) {
    throw invalid(
      'APPEX_INVALID_CAUSES',
      'provide either cause or causes, not both',
    );
  }

  let shouldInstall = hasCause;
  let value = input.cause;
  if (hasCauses) {
    const causes = input.causes;
    if (!Array.isArray(causes))
      throw invalid('APPEX_INVALID_CAUSES', 'causes must be an array');
    if (causes.length === 1) {
      shouldInstall = true;
      value = causes[0];
    } else if (causes.length > 1) {
      shouldInstall = true;
      value = new AggregateError(
        [...causes],
        `${target.name} has multiple causes`,
      );
    }
  }

  if (shouldInstall) {
    Object.defineProperty(target, 'cause', {
      value,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
}
