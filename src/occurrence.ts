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
  let hasCause: boolean;
  let hasCauses: boolean;
  let rawCause: unknown;
  let rawCauses: unknown;
  try {
    hasCause = Object.prototype.hasOwnProperty.call(input, 'cause');
    hasCauses = Object.prototype.hasOwnProperty.call(input, 'causes');
    rawCause = hasCause ? input.cause : undefined;
    rawCauses = hasCauses ? input.causes : undefined;
  } catch {
    throw invalid('APPEX_INVALID_CAUSES', 'cause could not be inspected');
  }
  if (hasCause && hasCauses) {
    throw invalid(
      'APPEX_INVALID_CAUSES',
      'provide either cause or causes, not both',
    );
  }

  let shouldInstall = hasCause;
  let value = rawCause;
  if (hasCauses) {
    const causes = rawCauses;
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
