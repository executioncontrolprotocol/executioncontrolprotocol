import path from "node:path"

/** Max UTF-8 bytes for an execution file. @category Storage */
export const EXECUTION_FILE_MAX_BYTES = 2 * 1024 * 1024
/** Max UTF-8 bytes for a `$script` file. @category Storage */
export const SCRIPT_FILE_MAX_BYTES = 1 * 1024 * 1024

/**
 * Paths under `$ECP_HOME`.
 * @category Storage
 */
export class HomePaths {
  /**
   * @param home Absolute `ECP_HOME`.
   */
  constructor(readonly home: string) {}

  /** `store/executions`. */
  executionsDir(): string {
    return path.join(this.home, "store", "executions")
  }

  /** Manifest path for one execution. */
  executionFile(id: string): string {
    return path.join(this.executionsDir(), `${id}.ecp.json`)
  }

  /** Meta path for one execution. */
  executionMeta(id: string): string {
    return path.join(this.executionsDir(), `${id}.meta.json`)
  }

  /** `store/configs`. */
  configsDir(): string {
    return path.join(this.home, "store", "configs")
  }

  /** Config object path. */
  configFile(id: string): string {
    return path.join(this.configsDir(), `${id}.json`)
  }

  /** `runs`. */
  runsDir(): string {
    return path.join(this.home, "runs")
  }

  /** One run directory. */
  runDir(runId: string): string {
    return path.join(this.runsDir(), runId)
  }

  /** `run.json`. */
  runRecord(runId: string): string {
    return path.join(this.runDir(runId), "run.json")
  }

  /** Manifest copy for a run. */
  runManifest(runId: string): string {
    return path.join(this.runDir(runId), "manifest.ecp.json")
  }

  /** `state.json`. */
  runState(runId: string): string {
    return path.join(this.runDir(runId), "state.json")
  }

  /** `events.ndjson`. */
  runEvents(runId: string): string {
    return path.join(this.runDir(runId), "events.ndjson")
  }

  /** Steps directory. */
  runStepsDir(runId: string): string {
    return path.join(this.runDir(runId), "steps")
  }

  /** One step file. */
  runStep(runId: string, nodeId: string, round?: number | null): string {
    const name = round === undefined || round === null ? `${nodeId}.json` : `${nodeId}#${round}.json`
    return path.join(this.runStepsDir(runId), name)
  }

  /** Artifacts directory. */
  runArtifacts(runId: string): string {
    return path.join(this.runDir(runId), "artifacts")
  }

  /** Root editor schema path. */
  executionSchema(): string {
    return path.join(this.home, "schema", "execution.schema.json")
  }

  /** Directory for per-plugin editor schema files. */
  pluginEditorSchemasDir(): string {
    return path.join(this.home, "schema", "plugins")
  }

  /**
   * Per-plugin editor schema path.
   * @param safePluginId Filesystem-safe plugin id (see engine `safePluginId`).
   */
  pluginEditorSchema(safePluginId: string): string {
    return path.join(this.pluginEditorSchemasDir(), `${safePluginId}.editor.schema.json`)
  }

  /** Stamp mapping plugin id → schema hash for lazy editor rewrites. */
  pluginEditorSchemaIndex(): string {
    return path.join(this.pluginEditorSchemasDir(), "index.json")
  }
}

/**
 * Pretty-print JSON with sorted object keys and a trailing newline.
 * @category Storage
 */
export function stableStringify(value: unknown): string {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sortKeys(item))
  if (value === null || typeof value !== "object") return value
  const output: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    output[key] = sortKeys((value as Record<string, unknown>)[key])
  }
  return output
}
