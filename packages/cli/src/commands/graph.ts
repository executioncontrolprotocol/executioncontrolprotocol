import { Command, Flags, Args } from "@oclif/core";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import type { ExecutionTrace } from "@executioncontrolprotocol/runtime";

import { renderTraceView, type TraceOutputFormat } from "../lib/trace-view.js";
import { getDefaultTraceDir } from "../lib/ecp-home.js";

export default class Graph extends Command {
  static summary = "Display execution graph";
  // Backwards-compatible alias for `ecp trace --output graph`.
  static hidden = true;

  static flags = {
    "trace-dir": Flags.string({
      description: "Directory for trace files",
      default: getDefaultTraceDir(),
    }),
  };

  static args = {
    runId: Args.string({
      required: true,
      description: "run id (e.g. run-123...)",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Graph);
    const runId = args.runId;

    const traceDir = flags["trace-dir"];
    const filePath = resolve(traceDir, `${runId}.json`);

    if (!existsSync(filePath)) {
      this.error(
        `\n  Trace not found: ${filePath}\n  Run ` +
          `ecp run <context.yaml> (tracing is enabled by default; use --no-trace to disable)\n`,
        { exit: 1 },
      );
    }

    const trace = JSON.parse(readFileSync(filePath, "utf-8")) as ExecutionTrace;
    const rendered = await renderTraceView(trace, "graph" as TraceOutputFormat);
    console.log(rendered);
  }
}

