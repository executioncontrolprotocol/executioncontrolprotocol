import type { ValidationResult } from "@executioncontrolprotocol/core/types"

/**
 * Props for {@link StatusFooter}.
 * @category App
 */
export interface StatusFooterProps {
  /** Latest workflow validation, or null before the first result. */
  validation: ValidationResult | null
  /** Opens {@link ValidationView} when the pill is Invalid. */
  onOpenInvalid?: () => void
  /** Absolute or workspace-relative workflow file path. Filename is shown; hover reveals the path. */
  path?: string
}

function workflowFileName(path: string): string {
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] || path
}

/**
 * 28px status strip with a Valid / Invalid / Ready pill and the workflow file name.
 * @category App
 */
export function StatusFooter({ validation, onOpenInvalid, path }: StatusFooterProps) {
  const hasResult = validation !== null
  const isValid = !hasResult || validation.valid
  const name = path ? workflowFileName(path) : undefined

  return (
    <footer className="status-footer" id="status-footer">
      {hasResult && !isValid ? (
        <button
          type="button"
          data-testid="ecp-status-pill"
          className="status-pill status-pill--invalid"
          aria-label="Workflow schema invalid"
          onClick={() => onOpenInvalid?.()}
        >
          <span className="status-pill-dot status-pill-dot--invalid" />
          <span>Invalid</span>
        </button>
      ) : (
        <div
          data-testid="ecp-status-pill"
          className="status-pill status-pill--valid"
          aria-label={hasResult ? "Workflow schema valid" : "Workflow schema ready"}
        >
          <span className="status-pill-dot" />
          <span>{hasResult ? "Valid" : "Ready"}</span>
        </div>
      )}
      {name ? (
        <span
          data-testid="ecp-status-file"
          className="status-footer-file"
          title={path}
        >
          {name}
        </span>
      ) : null}
    </footer>
  )
}
