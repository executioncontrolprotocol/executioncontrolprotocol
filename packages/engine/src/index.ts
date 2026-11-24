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
export type { JsonSchema } from "./schema/json-schema.js"
export {
  capabilityNameFromId,
  generateEditorRootSchema,
  generatePluginEditorSchema,
  pluginEditorSchemaRelativePath,
  pluginIdFromSafeFileName,
  safePluginId,
  wrapValue,
} from "./schema/editor-schema.js"
export { canonicalJson, sha256Hex } from "./schema/canonical.js"
export { closeMatches, damerauLevenshtein } from "./schema/suggest.js"
export { registerXEcpFileKeyword } from "./validate/file-access.js"
export {
  dedupeIssues,
  HostSchemaSet,
  loadExecutionText,
  mapCapabilityInputIssues,
  validateExecution,
  validateExecutionLayers,
} from "./validate/validate.js"
export type { SchemaFingerprint, ValidateOptions } from "./validate/validate.js"
export {
  allowsString,
  assertScriptPositions,
  collectMarkerPaths,
  collectSecretEnvIssues,
  filterMarkerExplainedErrors,
  isOpenSchema,
  isMarkerValue,
  subschemasAt,
  validateWithMarkers,
} from "./validate/markers.js"
export { runExecution, startExecution } from "./execute/run.js"
export type { ActiveRun, RunDependencies, RunOutcome, StateStore, StepSummary } from "./execute/run.js"
export { captureStepOutput } from "./execute/capture-output.js"
export type {
  CaptureOneDelegate,
  CaptureOneInput,
  CaptureOneResult,
  CaptureStepOutputOptions,
} from "./execute/capture-output.js"
export { resolveValue } from "./execute/resolve.js"
export { createHandlerContext, deepFreeze } from "./execute/handler-context.js"
export type { HandlerContextDeps } from "./execute/handler-context.js"
export { matchCandidates, tokensOf } from "./operations/match.js"
export type { MatchCandidate, MatchHit } from "./operations/match.js"
export { applyPatch } from "./operations/patch.js"
export { assembleCapabilityEntry, createOperations } from "./operations/operations.js"
export type { OperationsOptions } from "./operations/operations.js"
