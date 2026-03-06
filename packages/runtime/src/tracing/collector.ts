/**
 * Trace collector — accumulates spans during a Context execution
 * and produces a complete {@link ExecutionTrace}.
 *
 * @category Tracing
 */

import type {
  ExecutionTrace,
  TraceSpan,
  SpanType,
  SpanTokenUsage,
  TraceExporter,
} from "./types.js";

/**
 * Collects trace spans during an execution run.
 *
 * Call {@link startSpan} at the beginning of each unit of work and
 * {@link endSpan} when it completes. After the run finishes, call
 * {@link buildTrace} to produce the finalized {@link ExecutionTrace},
 * then {@link exportAll} to push it to all registered exporters.
 *
 * @category Tracing
 */
export class TraceCollector {
  private spans: TraceSpan[] = [];
  private openSpans = new Map<string, { span: Partial<TraceSpan>; startTime: number }>();
  private stepCounter = 0;
  private readonly exporters: TraceExporter[] = [];

  /**
   * Register one or more trace exporters.
   */
  addExporters(...exporters: TraceExporter[]): this {
    this.exporters.push(...exporters);
    return this;
  }

  /**
   * Begin a new span. Returns the span ID for later reference.
   */
  startSpan(opts: {
    type: SpanType;
    executorName: string;
    parentId?: string;
    model?: string;
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    mountName?: string;
    mountStage?: string;
  }): string {
    this.stepCounter++;
    const id = `span_${this.stepCounter}_${Date.now()}`;
    const now = Date.now();

    this.openSpans.set(id, {
      span: {
        id,
        parentId: opts.parentId,
        type: opts.type,
        executorName: opts.executorName,
        startedAt: new Date(now).toISOString(),
        step: this.stepCounter,
        model: opts.model,
        toolName: opts.toolName,
        toolArgs: opts.toolArgs,
        mountName: opts.mountName,
        mountStage: opts.mountStage,
      },
      startTime: now,
    });

    return id;
  }

  /**
   * End an open span, recording its results.
   */
  endSpan(spanId: string, result: {
    output?: unknown;
    reasoning?: string;
    tokens?: SpanTokenUsage;
    toolResult?: unknown;
    toolIsError?: boolean;
    mountItemCount?: number;
    error?: string;
  } = {}): void {
    const entry = this.openSpans.get(spanId);
    if (!entry) return;

    const now = Date.now();
    const span: TraceSpan = {
      ...entry.span,
      endedAt: new Date(now).toISOString(),
      durationMs: now - entry.startTime,
      output: result.output,
      reasoning: result.reasoning,
      tokens: result.tokens,
      toolResult: result.toolResult,
      toolIsError: result.toolIsError,
      mountItemCount: result.mountItemCount,
      error: result.error,
    } as TraceSpan;

    this.spans.push(span);
    this.openSpans.delete(spanId);
  }

  /**
   * Build the finalized execution trace.
   */
  buildTrace(meta: {
    executionId: string;
    contextName: string;
    contextVersion: string;
    strategy: string;
    startedAt: string;
    endedAt: string;
    durationMs: number;
    success: boolean;
    error?: string;
  }): ExecutionTrace {
    return {
      ...meta,
      spans: [...this.spans],
    };
  }

  /**
   * Export the trace to all registered exporters.
   */
  async exportAll(trace: ExecutionTrace): Promise<void> {
    for (const exporter of this.exporters) {
      try {
        await exporter.export(trace);
      } catch (err) {
        console.error(
          `[ECP TRACE] Exporter "${exporter.name}" failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /**
   * Return the current collected spans (for testing).
   */
  getSpans(): ReadonlyArray<TraceSpan> {
    return this.spans;
  }
}
