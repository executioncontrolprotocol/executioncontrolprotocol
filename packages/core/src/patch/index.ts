export { buildStepIndex, type StepIndex } from "./step-index.js"
export {
  resolveEcpPatchPath,
  type ResolvedPatchPath,
  type UnresolvedPatchPath,
  type ResolvePatchPathResult,
} from "./resolve-path.js"
export { normalizePatchInput, validatePatchDocument } from "./normalize-input.js"
export { applyPatch } from "./apply-patch.js"
export { createPatchBuilder, type PatchOperationBuilder } from "./patch-builder.js"
export { ecpPatchDocumentSchema, ecpPatchEntrySchema } from "./patch-document.js"
