import { describe, it, expect } from "vitest";
import { TraceCollector } from "../../src/tracing/collector.js";
import { formatTrace } from "../../src/tracing/formatter.js";
import { renderGraph } from "../../src/tracing/graph.js";
import type { ExecutionTrace, TraceExporter } from "../../src/tracing/types.js";

function buildSampleTrace(): ExecutionTrace {
  const collector = new TraceCollector();

  const execSpan = collector.startSpan({
    type: "executor",
    executorName: "orchestrator",
  });

  const genSpan = collector.startSpan({
    type: "model-generation",
    executorName: "orchestrator",
    parentId: execSpan,
    model: "gemma3:1b",
  });

  collector.endSpan(genSpan, {
    tokens: { prompt: 100, completion: 50, total: 150 },
    output: { delegate: [{ executor: "analyst", task: "Analyze data" }] },
    reasoning: "I need to delegate analysis to the analyst executor.",
  });

  const toolSpan = collector.startSpan({
    type: "tool-call",
    executorName: "analyst",
    parentId: execSpan,
    toolName: "jira:issues.search",
    toolArgs: { project: "OPS" },
  });

  collector.endSpan(toolSpan, {
    toolResult: [{ id: "ISS-1", title: "Bug fix" }],
    toolIsError: false,
  });

  const mountSpan = collector.startSpan({
    type: "mount-hydration",
    executorName: "analyst",
    mountName: "issues_seed",
    mountStage: "seed",
  });

  collector.endSpan(mountSpan, { mountItemCount: 3 });

  collector.endSpan(execSpan, {
    output: { summary: "All done" },
  });

  return collector.buildTrace({
    executionId: "run-test-001",
    contextName: "test-context",
    contextVersion: "1.0.0",
    strategy: "delegate",
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    durationMs: 5000,
    success: true,
  });
}

describe("TraceCollector", () => {
  it("collects spans and builds a trace", () => {
    const trace = buildSampleTrace();

    expect(trace.executionId).toBe("run-test-001");
    expect(trace.contextName).toBe("test-context");
    expect(trace.success).toBe(true);
    expect(trace.spans.length).toBe(4);
  });

  it("assigns sequential step numbers", () => {
    const trace = buildSampleTrace();
    const steps = trace.spans.map((s) => s.step);
    expect(steps).toEqual([2, 3, 4, 1]);
  });

  it("captures model generation details", () => {
    const trace = buildSampleTrace();
    const genSpan = trace.spans.find((s) => s.type === "model-generation");

    expect(genSpan).toBeDefined();
    expect(genSpan!.model).toBe("gemma3:1b");
    expect(genSpan!.tokens).toEqual({ prompt: 100, completion: 50, total: 150 });
    expect(genSpan!.reasoning).toContain("delegate analysis");
    expect(genSpan!.output).toHaveProperty("delegate");
  });

  it("captures tool call details", () => {
    const trace = buildSampleTrace();
    const toolSpan = trace.spans.find((s) => s.type === "tool-call");

    expect(toolSpan).toBeDefined();
    expect(toolSpan!.toolName).toBe("jira:issues.search");
    expect(toolSpan!.toolArgs).toEqual({ project: "OPS" });
    expect(toolSpan!.toolIsError).toBe(false);
    expect(toolSpan!.toolResult).toEqual([{ id: "ISS-1", title: "Bug fix" }]);
  });

  it("captures mount hydration details", () => {
    const trace = buildSampleTrace();
    const mountSpan = trace.spans.find((s) => s.type === "mount-hydration");

    expect(mountSpan).toBeDefined();
    expect(mountSpan!.mountName).toBe("issues_seed");
    expect(mountSpan!.mountStage).toBe("seed");
    expect(mountSpan!.mountItemCount).toBe(3);
  });

  it("links child spans to parent via parentId", () => {
    const trace = buildSampleTrace();
    const execSpan = trace.spans.find((s) => s.type === "executor");
    const genSpan = trace.spans.find((s) => s.type === "model-generation");

    expect(genSpan!.parentId).toBe(execSpan!.id);
  });

  it("records durationMs for each span", () => {
    const trace = buildSampleTrace();
    for (const span of trace.spans) {
      expect(typeof span.durationMs).toBe("number");
      expect(span.durationMs).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("TraceExporter interface", () => {
  it("exports to custom exporter", async () => {
    const exported: ExecutionTrace[] = [];
    const customExporter: TraceExporter = {
      name: "test",
      async export(trace) {
        exported.push(trace);
      },
    };

    const collector = new TraceCollector();
    collector.addExporters(customExporter);

    const span = collector.startSpan({
      type: "executor",
      executorName: "test",
    });
    collector.endSpan(span);

    const trace = collector.buildTrace({
      executionId: "run-export-test",
      contextName: "test",
      contextVersion: "1.0.0",
      strategy: "single",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: 100,
      success: true,
    });

    await collector.exportAll(trace);

    expect(exported.length).toBe(1);
    expect(exported[0].executionId).toBe("run-export-test");
  });
});

describe("formatTrace", () => {
  it("produces human-readable output with all span types", () => {
    const trace = buildSampleTrace();
    const output = formatTrace(trace);

    expect(output).toContain("Execution ID: run-test-001");
    expect(output).toContain("Context:      test-context v1.0.0");
    expect(output).toContain("Strategy:     delegate");
    expect(output).toContain("[Model] gemma3:1b");
    expect(output).toContain("Tokens:");
    expect(output).toContain("Reasoning:");
    expect(output).toContain("[Tool] jira:issues.search");
    expect(output).toContain("[Mount] issues_seed");
    expect(output).toContain("[Executor] orchestrator");
  });
});

describe("renderGraph", () => {
  it("produces an ASCII tree visualization", () => {
    const trace = buildSampleTrace();
    const output = renderGraph(trace);

    expect(output).toContain("run-test-001");
    expect(output).toContain("test-context");
    expect(output).toContain("orchestrator");
    expect(output).toContain("gemma3:1b");
    expect(output).toContain("jira:issues.search");
    expect(output).toContain("issues_seed");
    expect(output).toContain("├──");
    expect(output).toContain("└──");
  });
});
