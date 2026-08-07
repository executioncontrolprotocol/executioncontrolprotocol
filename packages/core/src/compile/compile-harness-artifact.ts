import { LATEST_ECP_VERSION, type ValidationResult } from "@executioncontrolprotocol/types"
import { evaluateHarnessArtifactModule } from "./evaluate-harness-artifact.js"
import {
  extractArtifactFromModule,
  type HarnessArtifactSchema,
} from "./extract-harness-artifact.js"
import { bundleWorkflowSource, isTypeScriptFile } from "./transpile.js"
import type { CompileDiagnostic } from "./types.js"

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
 * Compile TypeScript harness artifact source (intent or reply) and validate schema.
 * @category Compile
 */
export async function compileHarnessArtifactSource<T = unknown>(
  options: CompileHarnessArtifactSourceOptions
): Promise<CompileHarnessArtifactResult<T>> {
  const filename = options.filename ?? "artifact.ts"
  const resolveDir =
    typeof process !== "undefined" && process.cwd ? process.cwd() : "."
  try {
    const code =
      isTypeScriptFile(filename) || options.source.includes("@executioncontrolprotocol/")
        ? await bundleWorkflowSource(options.source, filename, resolveDir)
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

export { extractArtifactFromModule, type HarnessArtifactSchema } from "./extract-harness-artifact.js"
