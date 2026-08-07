import type { ValidationResult, WorkflowManifest } from "@executioncontrolprotocol/types"

/** Transpile or syntax error. @category Compile */
export interface CompileDiagnostic {
  message: string
  line?: number
  column?: number
  filename?: string
}

/** Result of compiling workflow source. @category Compile */
export interface CompileWorkflowResult {
  ok: boolean
  manifest?: WorkflowManifest
  compileErrors?: CompileDiagnostic[]
  validation?: ValidationResult
}

/** Options for compileWorkflowSource. @category Compile */
export interface CompileWorkflowSourceOptions {
  source: string
  filename?: string
  format?: "esm"
  /** Browser demo: resolve @executioncontrolprotocol imports via globalThis.__ecpWorkflowShim. */
  resolveImports?: "browser-global"
}
