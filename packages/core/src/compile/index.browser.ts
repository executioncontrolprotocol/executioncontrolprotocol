import type { EnvironmentDescriptor } from "@executioncontrolprotocol/types"
import { validateWorkflow } from "../validate/workflow.js"
import { evaluateWorkflowModule } from "./evaluate-browser.js"
import { bundleWorkflowSource, isTypeScriptFile } from "./transpile-browser.js"
import type {
  CompileWorkflowResult,
  CompileWorkflowSourceOptions,
} from "./types.js"

export type {
  CompileWorkflowResult,
  CompileWorkflowSourceOptions,
  CompileDiagnostic,
} from "./types.js"

export { extractWorkflowFromModule } from "./evaluate-browser.js"
export {
  warmBrowserWorkflowCompile,
  ESBUILD_WASM_URL_KEY,
  unpkgEsbuildWasmUrl,
  resolveEsbuildWasmInitializeUrl,
} from "./transpile-browser.js"

/**
 * Compile TypeScript or JavaScript workflow source to a manifest (browser-safe).
 * @category Compile
 */
export async function compileWorkflowSource(
  options: CompileWorkflowSourceOptions
): Promise<CompileWorkflowResult> {
  const filename = options.filename ?? "workflow.ts"
  try {
    const code =
      isTypeScriptFile(filename) ||
      options.source.includes("@executioncontrolprotocol/") ||
      options.resolveImports === "browser-global"
        ? await bundleWorkflowSource(
            options.source,
            filename,
            ".",
            options.resolveImports
          )
        : options.source
    const manifest = await evaluateWorkflowModule(code, filename.replace(/\.tsx?$/, ".js"))
    const validation = validateWorkflow(manifest)
    return {
      ok: validation.valid,
      manifest,
      validation,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      compileErrors: [{ message, filename }],
    }
  }
}

/**
 * Compile and validate workflow source (optional environment descriptor).
 * @category Compile
 */
export async function compileAndValidateWorkflowSource(
  options: CompileWorkflowSourceOptions & { descriptor?: EnvironmentDescriptor }
): Promise<CompileWorkflowResult> {
  const compiled = await compileWorkflowSource(options)
  if (!compiled.ok || !compiled.manifest) return compiled
  const validation = validateWorkflow(compiled.manifest, options.descriptor)
  return {
    ok: validation.valid,
    manifest: validation.valid ? compiled.manifest : undefined,
    validation,
    compileErrors: compiled.compileErrors,
  }
}
