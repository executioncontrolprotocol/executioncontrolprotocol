import type { EnvironmentDescriptor } from "@executioncontrolprotocol/types"
import { validateWorkflow } from "../validate/workflow.js"
import { evaluateWorkflowModule } from "./evaluate.js"
import { bundleWorkflowSource, isTypeScriptFile } from "./transpile.js"
import type {
  CompileWorkflowResult,
  CompileWorkflowSourceOptions,
} from "./types.js"

export type {
  CompileWorkflowResult,
  CompileWorkflowSourceOptions,
  CompileDiagnostic,
} from "./types.js"

/**
 * Compile TypeScript or JavaScript workflow source to a manifest.
 * @category Compile
 */
export async function compileWorkflowSource(
  options: CompileWorkflowSourceOptions
): Promise<CompileWorkflowResult> {
  const filename = options.filename ?? "workflow.ts"
  const resolveDir =
    typeof process !== "undefined" && process.cwd ? process.cwd() : "."
  try {
    const code = isTypeScriptFile(filename) || options.source.includes("@executioncontrolprotocol/")
      ? await bundleWorkflowSource(options.source, filename, resolveDir)
      : options.source
    const manifest = await evaluateWorkflowModule(code, filename.replace(/\.tsx?$/, ".js"))
    const validation = validateWorkflow(manifest)
    const ok = validation.valid
    return {
      ok,
      manifest: ok ? manifest : undefined,
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

export { extractWorkflowFromModule } from "./evaluate.js"
