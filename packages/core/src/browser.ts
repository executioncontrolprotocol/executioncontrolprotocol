/**
 * Browser-safe ECP authoring surface (compile + validate + builders).
 * @packageDocumentation
 */

export { ref } from "./helpers/ref.js"
export { state } from "./helpers/state.js"
export { env } from "./helpers/env.js"
export { secrets } from "./helpers/secrets.js"
export { browser } from "./helpers/browser.js"
export { expr } from "./helpers/expr.js"

export * from "./config-schema/index.js"
export {
  defineExtension,
  defineRuntime,
  definePolicy,
  capability,
  capabilityFor,
  hook,
} from "./definitions/index.js"
export { step } from "./bindings/step.js"
export { workflow, WorkflowBuilder } from "./workflow/builder.js"
export { parallel, branch, loop } from "./workflow/flow.js"

export { validateWorkflow } from "./validate/workflow.js"
export { zodIssuesToValidationIssues } from "./validate/zod-mapper.js"

export {
  compileWorkflowSource,
  compileAndValidateWorkflowSource,
  warmBrowserWorkflowCompile,
  ESBUILD_WASM_URL_KEY,
  type CompileWorkflowResult,
  type CompileWorkflowSourceOptions,
} from "./compile/index.browser.js"

export {
  renderWorkflowToFluent,
  renderWorkflowManifestToFluent,
  encodeFluent,
  type RenderWorkflowToFluentOptions,
} from "./fluent/index.js"
