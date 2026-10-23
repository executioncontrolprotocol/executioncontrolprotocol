import type { EnvironmentDescriptor } from "@executioncontrolprotocol/core/types"
import {
  extractLoadedWorkflowFromModule,
  extractWorkflowFromModule,
  validateWorkflow,
  type CompileWorkflowResult,
  type CompileWorkflowSourceOptions,
  type CompileDiagnostic,
  type LoadedWorkflow,
} from "@executioncontrolprotocol/core"
import { ECP_WORKFLOW_LOAD, EcpError } from "@executioncontrolprotocol/core/types"
import { evaluateLoadedWorkflowModule } from "./evaluate.js"
import { bundleWorkflowSource, isTypeScriptFile, resolveBundleDir } from "./transpile.js"

export type { CompileWorkflowResult, CompileWorkflowSourceOptions, CompileDiagnostic }

/**
 * Compile TypeScript or JavaScript workflow source to a manifest.
 * @category Compile
 */
export async function compileWorkflowSource(
  options: CompileWorkflowSourceOptions
): Promise<CompileWorkflowResult> {
  const filename = options.filename ?? "workflow.ts"
  const resolveDir = resolveBundleDir(filename)
  try {
    const code = isTypeScriptFile(filename) || options.source.includes("@executioncontrolprotocol/")
      ? await bundleWorkflowSource(options.source, filename, resolveDir)
      : options.source
    const loaded = await evaluateLoadedWorkflowModule(code, filename.replace(/\.tsx?$/, ".js"))
    const validation = validateWorkflow(loaded.manifest)
    const ok = validation.valid
    return {
      ok,
      manifest: ok ? loaded.manifest : undefined,
      validation,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const wrapped =
      err instanceof EcpError
        ? err
        : new EcpError(ECP_WORKFLOW_LOAD, message)
    return {
      ok: false,
      compileErrors: [{ message: wrapped.message, filename }],
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

export { extractWorkflowFromModule, extractLoadedWorkflowFromModule }
export type { LoadedWorkflow }
