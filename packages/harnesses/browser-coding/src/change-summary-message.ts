import { renderWorkflowToFluent } from "@executioncontrolprotocol/core"
import type { WorkflowManifest } from "@executioncontrolprotocol/types"

/**
 * Build the change-summary user message with Fluent before/after workflows.
 * @category Harness
 */
export function buildChangeSummaryMessage(
  userRequest: string,
  baseline: WorkflowManifest | undefined,
  authored: WorkflowManifest,
  mode: "run" | "probe"
): string {
  const ask =
    mode === "probe"
      ? "Summarize the discovery prefix in one or two short sentences, then ask if the user wants to run the probe to inspect results before finishing."
      : "Summarize the workflow changes below in one or two short sentences, then ask if the user wants to run the workflow."
  const lines = [ask, `User request: ${userRequest}`]
  if (baseline) {
    lines.push("Before (Fluent TypeScript):", renderWorkflowToFluent(baseline))
  } else {
    lines.push("Before: (new workflow)")
  }
  lines.push("After (Fluent TypeScript):", renderWorkflowToFluent(authored))
  return lines.join("\n")
}
