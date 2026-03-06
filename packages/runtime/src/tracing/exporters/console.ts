/**
 * Console trace exporter — prints a human-readable execution trace
 * to stderr.
 *
 * @category Tracing
 */

import type { ExecutionTrace, TraceExporter } from "../types.js";

/**
 * Exports execution traces as formatted text to the console.
 *
 * @category Tracing
 */
export class ConsoleTraceExporter implements TraceExporter {
  readonly name = "console";

  async export(trace: ExecutionTrace): Promise<void> {
    const lines: string[] = [];

    lines.push("");
    lines.push("═══ Execution Trace ═══");
    lines.push(`  Execution ID: ${trace.executionId}`);
    lines.push(`  Context:      ${trace.contextName} v${trace.contextVersion}`);
    lines.push(`  Strategy:     ${trace.strategy}`);
    lines.push(`  Duration:     ${trace.durationMs}ms`);
    lines.push(`  Success:      ${trace.success}`);
    if (trace.error) {
      lines.push(`  Error:        ${trace.error}`);
    }
    lines.push("");

    for (const span of trace.spans) {
      const prefix = `  Step ${span.step}`;

      switch (span.type) {
        case "executor":
          lines.push(`${prefix} [Executor: ${span.executorName}] (${span.durationMs}ms)`);
          if (span.error) lines.push(`         Error: ${span.error}`);
          break;

        case "model-generation":
          lines.push(`${prefix} [Model: ${span.model ?? "unknown"}] (${span.durationMs}ms)`);
          if (span.tokens) {
            lines.push(`         Tokens: ${span.tokens.prompt} prompt + ${span.tokens.completion} completion = ${span.tokens.total} total`);
          }
          if (span.reasoning) {
            const short = span.reasoning.length > 200
              ? span.reasoning.slice(0, 200) + "…"
              : span.reasoning;
            lines.push(`         Reasoning: ${short}`);
          }
          if (span.output) {
            const json = JSON.stringify(span.output);
            const short = json.length > 200 ? json.slice(0, 200) + "…" : json;
            lines.push(`         Output: ${short}`);
          }
          break;

        case "tool-call":
          lines.push(`${prefix} [Tool: ${span.toolName}] (${span.durationMs}ms)`);
          if (span.toolArgs) {
            lines.push(`         Args: ${JSON.stringify(span.toolArgs)}`);
          }
          if (span.toolIsError) {
            lines.push(`         Error: ${JSON.stringify(span.toolResult)}`);
          }
          break;

        case "mount-hydration":
          lines.push(
            `${prefix} [Mount: ${span.mountName} (${span.mountStage})] ` +
            `${span.mountItemCount ?? 0} items (${span.durationMs}ms)`,
          );
          break;

        case "delegation":
          lines.push(`${prefix} [Delegate: ${span.executorName}] (${span.durationMs}ms)`);
          if (span.error) lines.push(`         Error: ${span.error}`);
          break;
      }
    }

    lines.push("");
    console.error(lines.join("\n"));
  }
}
