/**
 * Browser-safe ECP authoring surface (compile + validate + builders).
 * @packageDocumentation
 */

export {
  ref,
  state,
  env,
  secrets,
  expr,
  defineExtension,
  defineEnvironment,
  definePolicy,
  capability,
  capabilityFor,
  hook,
  step,
  workflow,
  WorkflowBuilder,
  parallel,
  branch,
  loop,
  validateWorkflow,
  zodIssuesToValidationIssues,
  renderWorkflowToFluent,
  renderWorkflowManifestToFluent,
  encodeFluent,
  type RenderWorkflowToFluentOptions,
} from "@executioncontrolprotocol/core"

export {
  compileWorkflowSource,
  compileAndValidateWorkflowSource,
  warmBrowserWorkflowCompile,
  ESBUILD_WASM_URL_KEY,
  type CompileWorkflowResult,
  type CompileWorkflowSourceOptions,
} from "./compile/index.js"
