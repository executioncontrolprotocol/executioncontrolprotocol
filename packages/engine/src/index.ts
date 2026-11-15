/**
 * Service container and, later, validation and the executor.
 * @category Services
 */
export { VERSION } from "./version.js"
export {
  DEFAULT_EXPR_MAX_RESULT_BYTES,
  DEFAULT_EXPR_MEMORY_BYTES,
  DEFAULT_EXPR_TIMEOUT_MS,
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_STEP_TIMEOUT_MS,
  ServiceError,
} from "./container/constants.js"
export { createEnvironment, defineService, resolveHostSettings, unimplementedOperations } from "./container/environment.js"
export type {
  Environment,
  Host,
  Logger,
  Operations,
  ResolvedHostSettings,
  ServiceClass,
  ServiceContext,
  ServiceLookup,
  UseOptions,
} from "./container/environment.js"
