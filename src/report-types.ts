export const DIAGNOSTIC_REPORT_VERSION = 'appex/diagnostic/v2' as const;
export const PUBLIC_REPORT_VERSION = 'appex/public/v2' as const;

export type DiagnosticPrimitive = string | number | boolean | null;

export type DiagnosticMarker = {
  readonly $appex:
    | 'bigint'
    | 'cycle'
    | 'function'
    | 'invalid-date'
    | 'non-finite-number'
    | 'redacted'
    | 'symbol'
    | 'truncated'
    | 'undefined'
    | 'unreadable'
    | 'unsupported';
  readonly reason?: string;
  readonly value?: string;
  readonly omitted?: number;
};

export type DiagnosticValue =
  | DiagnosticPrimitive
  | DiagnosticMarker
  | readonly DiagnosticValue[]
  | { readonly [key: string]: DiagnosticValue };

export interface DiagnosticLimits {
  readonly maxDepth: number;
  readonly maxValues: number;
  readonly maxEntries: number;
  readonly maxStringLength: number;
  readonly maxBytes: number;
}

export interface DiagnosticReportOptions {
  readonly context?: object;
  readonly includeStack?: boolean;
  readonly limits?: Partial<DiagnosticLimits>;
  readonly redactKeys?: readonly string[];
}

export interface DiagnosticReport {
  readonly v: typeof DIAGNOSTIC_REPORT_VERSION;
  readonly reference: string;
  readonly kind?: string;
  readonly name: string;
  readonly message: string;
  readonly truncation?: {
    readonly messageOmitted?: number;
    readonly nameOmitted?: number;
    readonly diagnosticsOmitted?: true;
  };
  readonly code?: string | number;
  readonly status?: string | number;
  readonly timestamp?: string;
  readonly stack?: DiagnosticValue;
  readonly details?: DiagnosticValue;
  readonly context?: DiagnosticValue;
  readonly cause?: DiagnosticValue;
  readonly thrown?: DiagnosticValue;
  readonly messageRenderingError?: DiagnosticValue;
}

export interface PublicPresentation {
  readonly code?: string;
  readonly message?: string;
  readonly details?: unknown;
}

export interface PublicReport {
  readonly v: typeof PUBLIC_REPORT_VERSION;
  readonly reference: string;
  readonly code: string;
  readonly message: string;
  readonly details?: DiagnosticValue;
  readonly truncation?: {
    readonly messageOmitted?: number;
    readonly detailsOmitted?: true;
  };
}

export type DecodeDiagnosticReportError = {
  readonly code: 'INVALID_REPORT' | 'UNSUPPORTED_VERSION';
  readonly message: string;
  readonly path?: string;
};

export type DecodeDiagnosticReportResult =
  | { readonly success: true; readonly value: DiagnosticReport }
  | { readonly success: false; readonly error: DecodeDiagnosticReportError };
