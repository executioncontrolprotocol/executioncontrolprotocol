import type { ValidationIssue, ValidationResult } from "@executioncontrolprotocol/core/types"

/**
 * Props for {@link ValidationView}.
 * @category App
 */
export interface ValidationViewProps {
  /** Failed (or warning-only) validation result. */
  result: ValidationResult
  /** Close the dialog. */
  onClose: () => void
}

function IssueList({ title, issues }: { title: string; issues: ValidationIssue[] }) {
  if (issues.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-mono text-label uppercase tracking-widest text-on-surface-variant">{title}</h3>
      <ul className="flex flex-col gap-3">
        {issues.map((issue, index) => (
          <li key={`${issue.code}-${issue.path ?? ""}-${index}`} className="flex flex-col gap-1">
            <p className="text-body text-on-surface">{issue.message}</p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-outline">
              {issue.code}
              {issue.path ? ` · ${issue.path}` : ""}
            </p>
            {issue.suggestions && issue.suggestions.length > 0 ? (
              <ul className="list-disc pl-4 text-label text-on-surface-variant">
                {issue.suggestions.map((suggestion) => (
                  <li key={suggestion}>{suggestion}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Modal listing workflow validation issues. Recovered from the pre-reset demo, trimmed.
 * @category App
 */
export function ValidationView({ result, onClose }: ValidationViewProps) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="ecp-validation-title">
      <div className="modal-panel" data-testid="ecp-validation-view">
        <div className="modal-panel-header">
          <h2 id="ecp-validation-title" className="font-display text-lg text-on-surface">
            Validation
          </h2>
          <button
            type="button"
            className="modal-close-btn"
            aria-label="Close validation"
            onClick={onClose}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="modal-panel-scroll flex flex-col gap-4">
          <IssueList title="Errors" issues={result.errors} />
          <IssueList title="Warnings" issues={result.warnings} />
        </div>
      </div>
    </div>
  )
}
