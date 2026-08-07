import type { HarnessInvokeResult, InvokeResult } from "@executioncontrolprotocol/types"

const RAW_OUTPUT_PREVIEW_CHARS = 4000

/**
 * Format harness trace fields for eval failure messages.
 * @category Evals
 */
export function formatHarnessTrace(harnessOutput: HarnessInvokeResult): string {
  const { trace, validation, raw } = harnessOutput
  const sections: string[] = [
    `harness: ${trace.harness}`,
    `provider: ${trace.provider}`,
    `model: ${trace.model ?? "(default)"}`,
    `outputFormat: ${trace.outputFormat ?? "?"}`,
    `decodeSucceeded: ${String(trace.decodeSucceeded ?? "?")}`,
    `validationSucceeded: ${String(trace.validationSucceeded ?? "?")}`,
  ]

  if (trace.repairAttempts !== undefined) {
    sections.push(`repairAttempts: ${trace.repairAttempts.length}`)
  }

  if (validation && !validation.valid) {
    sections.push(`validationErrors: ${JSON.stringify(validation.errors, null, 2)}`)
  }

  if (trace.prompt) {
    sections.push(`prompt:\n${trace.prompt}`)
  }

  const rawText = trace.rawOutput ?? raw
  if (rawText) {
    sections.push(`rawModelOutput:\n${rawText.slice(0, RAW_OUTPUT_PREVIEW_CHARS)}`)
  }

  return sections.join("\n\n")
}

/**
 * Format invoke failure diagnostics (includes raw model text when harness throws on decode).
 * @category Evals
 */
export function formatInvokeFailure(result: InvokeResult): string {
  const lines = result.diagnostics.map(
    (d) => `[${d.code ?? "error"}] ${d.message}${d.path ? ` (${d.path})` : ""}`
  )
  if (result.validation?.errors?.length) {
    lines.push(`validation: ${JSON.stringify(result.validation.errors, null, 2)}`)
  }
  const harnessOutput = result.success
    ? undefined
    : (result.result as HarnessInvokeResult | undefined)
  if (harnessOutput?.trace) {
    lines.push("", "--- harness trace ---", formatHarnessTrace(harnessOutput))
  }
  return lines.join("\n")
}
