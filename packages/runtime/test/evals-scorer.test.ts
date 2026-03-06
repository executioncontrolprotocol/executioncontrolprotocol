import { describe, it, expect } from "vitest";
import { scoreExecution } from "../src/evals/scorer.js";
import type { ExecutionResult } from "../src/engine/types.js";
import type { EvalExpected } from "../src/evals/types.js";

function makeResult(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    success: true,
    runId: "test-run",
    contextName: "test",
    contextVersion: "1.0.0",
    output: { headline: "Test", body: "Works" },
    executorOutputs: {},
    totalBudgetUsage: { toolCalls: 0, runtimeSeconds: 1 },
    log: [],
    durationMs: 1000,
    ...overrides,
  };
}

describe("Eval scorer", () => {
  const rubric: EvalExpected = {
    rubric: [
      { name: "valid", description: "Schema valid", weight: 0.3, check: { type: "schema-valid" } },
      { name: "headline", description: "Has headline", weight: 0.3, check: { type: "field-exists", path: "headline" } },
      { name: "body", description: "Has body", weight: 0.2, check: { type: "field-exists", path: "body" } },
      { name: "no-tools", description: "No tools", weight: 0.2, check: { type: "tool-count-within", max: 0 } },
    ],
    minScore: 0.8,
    hardGates: ["valid"],
  };

  it("passes when all criteria are met", () => {
    const result = scoreExecution("case-1", rubric, makeResult());
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1.0);
    expect(result.criteria.every((c) => c.passed)).toBe(true);
  });

  it("fails when a hard gate fails", () => {
    const result = scoreExecution(
      "case-2",
      rubric,
      makeResult({ success: false, output: undefined }),
    );
    expect(result.passed).toBe(false);
    expect(result.criteria.find((c) => c.criterion.name === "valid")?.passed).toBe(false);
  });

  it("fails when score is below threshold", () => {
    const result = scoreExecution(
      "case-3",
      rubric,
      makeResult({ output: {} }),
    );
    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(0.8);
  });

  it("scores field-matches correctly", () => {
    const patternRubric: EvalExpected = {
      rubric: [
        { name: "match", description: "Headline matches", weight: 1.0, check: { type: "field-matches", path: "headline", pattern: "test" } },
      ],
      minScore: 1.0,
    };
    const result = scoreExecution("case-4", patternRubric, makeResult());
    expect(result.passed).toBe(true);
  });

  it("scores array-min-length correctly", () => {
    const arrayRubric: EvalExpected = {
      rubric: [
        { name: "items", description: "Has items", weight: 1.0, check: { type: "array-min-length", path: "items", min: 2 } },
      ],
      minScore: 1.0,
    };

    const passing = scoreExecution(
      "case-5a",
      arrayRubric,
      makeResult({ output: { items: [1, 2, 3] } }),
    );
    expect(passing.passed).toBe(true);

    const failing = scoreExecution(
      "case-5b",
      arrayRubric,
      makeResult({ output: { items: [1] } }),
    );
    expect(failing.passed).toBe(false);
  });

  it("scores no-forbidden-tools correctly", () => {
    const toolRubric: EvalExpected = {
      rubric: [
        { name: "safe", description: "No dangerous tools", weight: 1.0, check: { type: "no-forbidden-tools", forbidden: ["dangerous:nuke"] } },
      ],
      minScore: 1.0,
    };
    const result = scoreExecution("case-6", toolRubric, makeResult());
    expect(result.passed).toBe(true);
  });
});
