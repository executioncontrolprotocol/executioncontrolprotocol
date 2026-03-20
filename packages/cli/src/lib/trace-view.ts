import type { ExecutionTrace } from "@executioncontrolprotocol/runtime";

export type TraceOutputFormat = "text" | "graph";

export async function renderTraceView(
  trace: ExecutionTrace,
  output: TraceOutputFormat,
): Promise<string> {
  const runtime = await import("@executioncontrolprotocol/runtime");
  if (output === "graph") {
    return runtime.renderGraph(trace);
  }
  return runtime.formatTrace(trace);
}

