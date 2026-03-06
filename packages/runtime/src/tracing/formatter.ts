/**
 * Trace formatter — produces human-readable output for `ecp trace`.
 *
 * @category Tracing
 */

import type { ExecutionTrace, TraceSpan } from "./types.js";

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function formatSpan(span: TraceSpan): string[] {
  const lines: string[] = [];
  const label = `Step ${span.step}`;

  switch (span.type) {
    case "executor":
      lines.push(`${label}  [Executor] ${span.executorName} (${span.durationMs}ms)`);
      if (span.error) lines.push(`        Error: ${span.error}`);
      break;

    case "model-generation":
      lines.push(`${label}  [Model] ${span.model ?? "unknown"} for ${span.executorName} (${span.durationMs}ms)`);
      if (span.tokens) {
        lines.push(`        Tokens: ${span.tokens.prompt} in / ${span.tokens.completion} out / ${span.tokens.total} total`);
      }
      if (span.reasoning) {
        lines.push(`        Reasoning: ${truncate(span.reasoning, 300)}`);
      }
      if (span.output) {
        lines.push(`        Output: ${truncate(JSON.stringify(span.output), 300)}`);
      }
      if (span.error) lines.push(`        Error: ${span.error}`);
      break;

    case "tool-call":
      lines.push(`${label}  [Tool] ${span.toolName} for ${span.executorName} (${span.durationMs}ms)`);
      if (span.toolArgs && Object.keys(span.toolArgs).length > 0) {
        lines.push(`        Args: ${truncate(JSON.stringify(span.toolArgs), 200)}`);
      }
      if (span.toolIsError) {
        lines.push(`        Error: ${truncate(JSON.stringify(span.toolResult), 200)}`);
      } else if (span.toolResult !== undefined) {
        lines.push(`        Result: ${truncate(JSON.stringify(span.toolResult), 200)}`);
      }
      break;

    case "mount-hydration":
      lines.push(
        `${label}  [Mount] ${span.mountName} (${span.mountStage}) → ${span.mountItemCount ?? 0} items (${span.durationMs}ms)`,
      );
      break;

    case "delegation":
      lines.push(`${label}  [Delegate] → ${span.executorName} (${span.durationMs}ms)`);
      if (span.error) lines.push(`        Error: ${span.error}`);
      break;
  }

  return lines;
}

/**
 * Format an execution trace for terminal display.
 *
 * @param trace - The trace to format.
 * @returns Multi-line string ready for printing.
 *
 * @category Tracing
 */
export function formatTrace(trace: ExecutionTrace): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(`Execution ID: ${trace.executionId}`);
  lines.push(`Context:      ${trace.contextName} v${trace.contextVersion}`);
  lines.push(`Strategy:     ${trace.strategy}`);
  lines.push(`Duration:     ${trace.durationMs}ms`);
  lines.push(`Status:       ${trace.success ? "success" : "failed"}`);
  if (trace.error) {
    lines.push(`Error:        ${trace.error}`);
  }
  lines.push("");

  for (const span of trace.spans) {
    lines.push(...formatSpan(span));
  }

  lines.push("");
  return lines.join("\n");
}
