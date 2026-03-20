import ora from "ora";
import type { ExecutionProgressEvent, ProgressCallback } from "@executioncontrolprotocol/runtime";

function phaseToLabel(status: string): string {
  const labels: Record<string, string> = {
    loading: "Loading context...",
    "hydrating-seed": "Hydrating seed mounts...",
    "running-orchestrator": "Running orchestrator...",
    delegating: "Delegating tasks...",
    "hydrating-focus": "Hydrating focus mounts...",
    "hydrating-deep": "Hydrating deep mounts...",
    "running-specialist": "Running specialist...",
    merging: "Merging outputs...",
    completed: "Completed.",
    failed: "Failed.",
  };
  return labels[status] ?? status;
}

export function createProgressHandler(
  spinner: ReturnType<typeof ora>,
  contextPath: string,
  contextName: string,
): ProgressCallback {
  let currentText = "Starting...";
  const completedSteps: Array<{
    step: number;
    executorName: string;
    description: string;
    durationMs: number;
    tokens?: { prompt: number; completion: number; total: number };
    model?: string;
    output?: unknown;
  }> = [];

  function redraw(): void {
    const isTTY = process.stderr.isTTY;
    if (isTTY) {
      process.stderr.write("\x1b[2J\x1b[H");
    }
    process.stderr.write(`\n  Running: ${contextPath}\n`);
    process.stderr.write(`  Context: ${contextName}\n\n`);
    for (const s of completedSteps) {
      process.stderr.write(`  Step ${s.step}: ${s.description} (${s.durationMs}ms)\n`);
      if (s.model) {
        process.stderr.write(`    Model: ${s.model}\n`);
      }
      if (s.tokens && s.tokens.total > 0) {
        process.stderr.write(
          `    Tokens: ${s.tokens.prompt} prompt + ${s.tokens.completion} completion = ${s.tokens.total} total\n`,
        );
      }
      if (s.output !== undefined) {
        process.stderr.write(`    Output:\n`);
        const json = JSON.stringify(s.output, null, 2);
        for (const line of json.split(/\r?\n/)) {
          process.stderr.write(`      ${line}\n`);
        }
      }
      process.stderr.write("\n");
    }
    spinner.start(currentText);
  }

  function appendLastStep(): void {
    const s = completedSteps[completedSteps.length - 1];
    if (!s) return;
    spinner.stopAndPersist({
      text: `Step ${s.step}: ${s.description} (${s.durationMs}ms)`,
    });
    process.stderr.write(`    Model: ${s.model ?? "n/a"}\n`);
    if (s.tokens && s.tokens.total > 0) {
      process.stderr.write(
        `    Tokens: ${s.tokens.prompt} prompt + ${s.tokens.completion} completion = ${s.tokens.total} total\n`,
      );
    }
    if (s.output !== undefined) {
      process.stderr.write(`    Output:\n`);
      const json = JSON.stringify(s.output, null, 2);
      for (const line of json.split(/\r?\n/)) {
        process.stderr.write(`      ${line}\n`);
      }
    }
    process.stderr.write("\n");
    spinner.start(currentText);
  }

  return async (event: ExecutionProgressEvent) => {
    switch (event.type) {
      case "phase":
        currentText = phaseToLabel(event.status);
        spinner.text = currentText;
        break;
      case "step_start":
        currentText = event.description;
        spinner.text = currentText;
        break;
      case "step_complete":
        if (event.kind === "executor") {
          completedSteps.push({
            step: event.step,
            executorName: event.executorName ?? "",
            description: event.description,
            durationMs: event.durationMs,
            tokens: event.tokens,
            model: event.model,
            output: event.output,
          });

          spinner.stop();
          if (process.stderr.isTTY) {
            redraw();
          } else {
            appendLastStep();
          }
        }
        break;
      case "executor_reasoning":
        spinner.stop();
        {
          const lines = event.reasoning.split(/\r?\n/);
          process.stderr.write(`\n  [${event.executorName}] Chain of thought:\n`);
          for (const line of lines) {
            process.stderr.write(`    ${line}\n`);
          }
          process.stderr.write("\n");
        }
        spinner.start(currentText);
        break;
    }
  };
}

