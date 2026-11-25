/**
 * Coarse class of an {@link ErrorCatalogueEntry}.
 * @category Errors
 */
export type ErrorKind = "validation" | "runtime" | "request" | "host" | "internal"

/**
 * HTTP status, CLI exit code and kind for one catalogue code.
 *
 * Runtime failures that surface inside a run record use `httpStatus: null`.
 * `ECP_COMMIT_CONFLICT` and `ECP_SCRIPT_INVALID` are catalogued with the
 * validation-time exit code `2`. A run-time occurrence of those codes uses
 * exit code `1` (spec 06).
 *
 * @category Errors
 */
export interface ErrorCatalogueEntry {
  /** HTTP status, or `null` when the failure is not an HTTP response. */
  readonly httpStatus: number | null
  /** CLI exit code: 0 ok, 1 run/internal, 2 request, 3 missing plugins, 4 host. */
  readonly exitCode: 0 | 1 | 2 | 3 | 4
  /** Coarse class. */
  readonly kind: ErrorKind
}

/**
 * The error catalogue from spec 06, plus `ECP_SERVICE_*` programmer errors.
 * @category Errors
 */
export const ERROR_CATALOGUE = {
  ECP_REQUEST_INVALID: { httpStatus: 400, exitCode: 2, kind: "request" },
  ECP_EXECUTION_LOAD: { httpStatus: 400, exitCode: 2, kind: "request" },
  ECP_NOT_FOUND: { httpStatus: 404, exitCode: 2, kind: "request" },
  ECP_ALREADY_EXISTS: { httpStatus: 409, exitCode: 2, kind: "request" },
  ECP_VERSION_CONFLICT: { httpStatus: 409, exitCode: 2, kind: "request" },
  ECP_MANIFEST_INVALID: { httpStatus: 422, exitCode: 2, kind: "validation" },
  ECP_NODE_DETACHED: { httpStatus: 422, exitCode: 2, kind: "validation" },
  ECP_CAPABILITY_UNKNOWN: { httpStatus: 422, exitCode: 2, kind: "validation" },
  ECP_PLUGINS_MISSING: { httpStatus: 422, exitCode: 3, kind: "validation" },
  ECP_INPUT_INVALID: { httpStatus: 422, exitCode: 2, kind: "validation" },
  ECP_REF_UNRESOLVED: { httpStatus: 422, exitCode: 2, kind: "validation" },
  ECP_REF_MAYBE_MISSING: { httpStatus: 422, exitCode: 2, kind: "validation" },
  ECP_REF_PATH_INVALID: { httpStatus: 422, exitCode: 2, kind: "validation" },
  ECP_TYPE_MISMATCH: { httpStatus: 422, exitCode: 2, kind: "validation" },
  ECP_COMMIT_CONFLICT: { httpStatus: 422, exitCode: 2, kind: "validation" },
  ECP_RETURNS_UNRESOLVED: { httpStatus: 422, exitCode: 2, kind: "validation" },
  ECP_EXPR_INVALID: { httpStatus: 422, exitCode: 2, kind: "validation" },
  ECP_SCRIPT_INVALID: { httpStatus: 422, exitCode: 2, kind: "validation" },
  ECP_CONFIG_UNKNOWN: { httpStatus: 422, exitCode: 2, kind: "validation" },
  ECP_CONFIG_INVALID: { httpStatus: 422, exitCode: 2, kind: "validation" },
  ECP_PATCH_INVALID: { httpStatus: 422, exitCode: 2, kind: "validation" },
  ECP_SECRET_MISSING: { httpStatus: null, exitCode: 1, kind: "runtime" },
  ECP_STEP_FAILED: { httpStatus: null, exitCode: 1, kind: "runtime" },
  ECP_STEP_TIMEOUT: { httpStatus: null, exitCode: 1, kind: "runtime" },
  ECP_OUTPUT_INVALID: { httpStatus: null, exitCode: 1, kind: "runtime" },
  ECP_EXPR_FAILED: { httpStatus: null, exitCode: 1, kind: "runtime" },
  ECP_EXPR_TIMEOUT: { httpStatus: null, exitCode: 1, kind: "runtime" },
  ECP_EXPR_RESULT_INVALID: { httpStatus: null, exitCode: 1, kind: "runtime" },
  ECP_SCRIPT_FAILED: { httpStatus: null, exitCode: 1, kind: "runtime" },
  ECP_SCRIPT_TIMEOUT: { httpStatus: null, exitCode: 1, kind: "runtime" },
  ECP_PLUGIN_LOAD_FAILED: { httpStatus: null, exitCode: 1, kind: "runtime" },
  ECP_PROVIDER_ERROR: { httpStatus: null, exitCode: 1, kind: "runtime" },
  ECP_RUN_CANCELLED: { httpStatus: null, exitCode: 1, kind: "runtime" },
  ECP_LIMIT_EXCEEDED: { httpStatus: null, exitCode: 1, kind: "runtime" },
  ECP_HOST_RESTARTING: { httpStatus: 503, exitCode: 4, kind: "host" },
  ECP_HOST_UNAVAILABLE: { httpStatus: null, exitCode: 4, kind: "host" },
  ECP_UNAUTHORIZED: { httpStatus: 401, exitCode: 4, kind: "host" },
  ECP_INTERNAL: { httpStatus: 500, exitCode: 1, kind: "internal" },
  ECP_SERVICE_AMBIGUOUS: { httpStatus: null, exitCode: 1, kind: "internal" },
  ECP_SERVICE_MISSING: { httpStatus: null, exitCode: 1, kind: "internal" },
  ECP_SERVICE_DUPLICATE: { httpStatus: null, exitCode: 1, kind: "internal" },
  ECP_SERVICE_LOOKUP_TOO_EARLY: { httpStatus: null, exitCode: 1, kind: "internal" },
} as const satisfies Record<string, ErrorCatalogueEntry>

/**
 * Every code in {@link ERROR_CATALOGUE}.
 * @category Errors
 */
export type EcpErrorCode = keyof typeof ERROR_CATALOGUE

/**
 * Look up one catalogue entry. Programmer errors (`ECP_SERVICE_*`) are thrown
 * by the container; they are not operation responses.
 * @category Errors
 */
export function catalogueEntry(code: EcpErrorCode): ErrorCatalogueEntry {
  return ERROR_CATALOGUE[code]
}

/**
 * Whether `code` is a known catalogue code.
 * @category Errors
 */
export function isEcpErrorCode(code: string): code is EcpErrorCode {
  return Object.prototype.hasOwnProperty.call(ERROR_CATALOGUE, code)
}
