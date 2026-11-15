import type { ValidationIssue } from "@executioncontrolprotocol/protocol"

/**
 * Props for {@link RunOutputView}.
 * @category App
 */
export interface RunOutputViewProps {
  /** Run result (keys selected by `execution.returns`), or null before the run ends. */
  result?: Record<string, unknown> | null
  /** Failure issue, when the run failed. */
  error?: ValidationIssue | null
}

/**
 * Read-only view of a run's result JSON, or its failure issue with suggestions.
 * @category App
 */
export function RunOutputView({ result, error }: RunOutputViewProps) {
  if (error) {
    return (
      <section data-testid="run-error" className="space-y-2 rounded border border-error/40 bg-surface-container-lowest p-3">
        <p className="font-mono text-label text-error">{error.code}</p>
        <p className="text-sm text-on-surface">{error.message}</p>
        {error.path ? <p className="font-mono text-[11px] text-on-surface-variant">{error.path}</p> : null}
        {error.suggestions && error.suggestions.length > 0 ? (
          <ul className="list-disc space-y-1 pl-4 text-[12px] text-on-surface-variant">
            {error.suggestions.map((suggestion) => (
              <li key={suggestion}>{suggestion}</li>
            ))}
          </ul>
        ) : null}
      </section>
    )
  }
  if (result === undefined || result === null) {
    return <p className="text-label text-on-surface-variant">No result yet.</p>
  }
  return (
    <section data-testid="run-result" className="space-y-2">
      <p className="font-mono text-label uppercase text-on-surface-variant">Result</p>
      <pre className="max-h-80 overflow-auto rounded border border-outline-variant bg-surface-container-lowest p-3 font-mono text-[12px] text-on-surface">
        {JSON.stringify(result, null, 2)}
      </pre>
    </section>
  )
}
