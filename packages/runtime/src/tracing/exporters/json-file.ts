/**
 * JSON file trace exporter — persists execution traces as JSON files
 * so they can be loaded later by `ecp trace` and `ecp graph`.
 *
 * @category Tracing
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { ExecutionTrace, TraceExporter } from "../types.js";

/**
 * Configuration for the JSON file exporter.
 *
 * @category Tracing
 */
export interface JsonFileExporterConfig {
  /** Directory to write trace files to. Defaults to `"./traces"`. */
  outputDir?: string;
}

/**
 * Exports execution traces as JSON files to disk.
 *
 * Each trace is saved as `<outputDir>/<executionId>.json`.
 *
 * @category Tracing
 */
export class JsonFileTraceExporter implements TraceExporter {
  readonly name = "json-file";
  private readonly outputDir: string;

  constructor(config: JsonFileExporterConfig = {}) {
    this.outputDir = config.outputDir ?? "./traces";
  }

  async export(trace: ExecutionTrace): Promise<void> {
    mkdirSync(this.outputDir, { recursive: true });
    const filePath = resolve(this.outputDir, `${trace.executionId}.json`);
    writeFileSync(filePath, JSON.stringify(trace, null, 2), "utf-8");
  }
}
