import type { EnvironmentDescriptor } from "@executioncontrolprotocol/types"
import { LATEST_ECP_VERSION, type ValidationResult } from "@executioncontrolprotocol/types"
import { validateWorkflow } from "../validate/workflow.js"
import {
  evaluateHarnessArtifactModule,
  evaluateWorkflowModule,
} from "./evaluate-browser.js"
import {
  extractArtifactFromModule,
  type HarnessArtifactSchema,
} from "./extract-harness-artifact.js"
import { bundleWorkflowSource, isTypeScriptFile } from "./transpile-browser.js"
import type {
  CompileWorkflowResult,
  CompileWorkflowSourceOptions,
  CompileDiagnostic,
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
export { extractArtifactFromModule, type HarnessArtifactSchema } from "./extract-harness-artifact.js"

/** Result of compiling harness artifact TypeScript source. @category Compile */
export interface CompileHarnessArtifactResult<T = unknown> {
  /** Whether compile and schema validation succeeded. */
  ok: boolean
  /** Parsed artifact when ok. */
  artifact?: T
  /** Transpile or extraction errors when not ok. */
  compileErrors?: CompileDiagnostic[]
  /** Zod validation summary. */
  validation?: ValidationResult
}

/** Options for {@link compileHarnessArtifactSource}. @category Compile */
export interface CompileHarnessArtifactSourceOptions {
  /** TypeScript module source. */
  source: string
  /** Virtual filename for bundling (default artifact.ts). */
  filename?: string
  /** Expected document schema id. */
  expectedSchema: HarnessArtifactSchema
}

function validationFromOk(valid: boolean): ValidationResult {
  return {
    schema: "@executioncontrolprotocol.validation.result",
    version: LATEST_ECP_VERSION,
    valid,
    errors: [],
    warnings: [],
  }
}

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

/**
 * Compile TypeScript harness artifact source (intent or reply) in the browser.
 * @category Compile
 */
export async function compileHarnessArtifactSource<T = unknown>(
  options: CompileHarnessArtifactSourceOptions
): Promise<CompileHarnessArtifactResult<T>> {
  const filename = options.filename ?? "artifact.ts"
  try {
    const code =
      isTypeScriptFile(filename) || options.source.includes("@executioncontrolprotocol/")
        ? await bundleWorkflowSource(options.source, filename, ".")
        : options.source
    const mod = await evaluateHarnessArtifactModule(
      code,
      filename.replace(/\.tsx?$/, ".js")
    )
    const artifact = extractArtifactFromModule(mod, options.expectedSchema)
    return {
      ok: true,
      artifact: artifact as T,
      validation: validationFromOk(true),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      compileErrors: [{ message, filename }],
      validation: validationFromOk(false),
    }
  }
}
