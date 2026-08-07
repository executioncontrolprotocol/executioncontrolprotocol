import {
  workflow,
  step,
  ref,
  state,
  env,
  expr,
  parallel,
  branch,
  loop,
} from "@executioncontrolprotocol/core"

/** Workflow builder symbols exposed to browser Fluent compile via globalThis. */
export interface BrowserWorkflowShim {
  workflow: typeof workflow
  step: typeof step
  ref: typeof ref
  state: typeof state
  env: typeof env
  expr: typeof expr
  parallel: typeof parallel
  branch: typeof branch
  loop: typeof loop
}

declare global {
  var __ecpWorkflowShim: BrowserWorkflowShim | undefined
}

/** Install workflow builders on globalThis for browser Fluent compile-on-edit. @category Environment */
export function installBrowserWorkflowShim(): BrowserWorkflowShim {
  const shim: BrowserWorkflowShim = {
    workflow,
    step,
    ref,
    state,
    env,
    expr,
    parallel,
    branch,
    loop,
  }
  globalThis.__ecpWorkflowShim = shim
  return shim
}
