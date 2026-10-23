export {
  BROWSER_ENVIRONMENT_ID,
  browserEnvironmentDefinition,
  BrowserRuntimeExecutor,
  registerBrowserEnvironment,
} from "./runtime/builtin-browser.js"

export {
  browserRegistryExtension,
  registerBrowserRegistryExtension,
  exposeBrowserRegistry,
  getActiveBrowserEnvironmentHost,
} from "./extensions/browser-registry.js"

export {
  browserLocalConfigExtension,
  registerBrowserLocalConfigExtension,
} from "./extensions/browser-local-config.js"

export {
  environment,
  createBrowserEnvironment,
} from "./environment.js"
export {
  compileWorkflowSource,
  compileAndValidateWorkflowSource,
  warmBrowserWorkflowCompile,
  ESBUILD_WASM_URL_KEY,
  type CompileWorkflowResult,
  type CompileWorkflowSourceOptions,
} from "./compile/index.js"
export {
  bundleWorkflowSource as bundleBrowserWorkflowSource,
  transpileWorkflowSource,
  unpkgEsbuildWasmUrl,
  resolveEsbuildWasmInitializeUrl,
  isEsbuildAlreadyInitializedError,
  resolveEsbuildWasmApi,
} from "./compile/transpile-browser.js"
export { prepareBrowserWorkflowSource } from "./compile/prepare-browser-source.js"
export { createEcp, type BrowserOperationalEcp, type CreateEcpOptions } from "./create-ecp.js"
export { installBrowserWorkflowShim, type BrowserWorkflowShim } from "./workflow-shim.js"
export type { BrowserEcpGlobal } from "./extensions/browser-registry.js"
export type { Ecp } from "@executioncontrolprotocol/core"

export {
  workflow,
  step,
  ref,
  state,
  env,
  secrets,
  expr,
  parallel,
  branch,
  loop,
  extension,
  policy,
  defineExtension,
  defineEnvironment,
  definePolicy,
  capability,
  capabilityFor,
  hook,
  Environment,
  Registry,
  BROWSER_FILE_LOCATOR_PREFIX,
  isBrowserFileLocator,
  createBrowserFileLocator,
  createCapabilityBlobStore,
  stashCapabilityBlob,
  handleMixedBrowserBlobUpload,
} from "@executioncontrolprotocol/core"
export type {
  CapabilityBlob,
  CapabilityBlobStore,
  MixedBlobUploadInput,
  MixedBlobUploadOutput,
  RemoteInvokeBinding,
  RunOptions,
} from "@executioncontrolprotocol/core"
