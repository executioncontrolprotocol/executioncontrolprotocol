import { AlertTriangle, CheckCircle2, Info } from "lucide-react"
import type { ExecutionManifest, OperationError, ValidationIssue } from "@executioncontrolprotocol/protocol"
import { issueNodeId, type AppValidation } from "../../client/index.js"

/**
 * Props for {@link ValidationView}.
 * @category App
 */
export interface ValidationViewProps {
  /** Latest validation, if any. */
  validation?: AppValidation
  /** Manifest the issue paths point into. */
  manifest?: ExecutionManifest
  /** Current load error (the issues shown are from the last good load). */
  loadError?: OperationError
  /** Called when an issue that belongs to a node is clicked. */
  onSelectNode: (nodeId: string) => void
}

function IssueItem({
  issue,
  nodeId,
  onSelectNode,
}: {
  issue: ValidationIssue
  nodeId?: string
  onSelectNode: (nodeId: string) => void
}) {
  const error = issue.severity === "error"
  const Icon = error ? AlertTriangle : Info
  return (
    <li>
      <button
        type="button"
        data-testid="validation-issue"
        data-code={issue.code}
        data-severity={issue.severity}
        data-node-id={nodeId ?? ""}
        disabled={!nodeId}
        onClick={() => nodeId && onSelectNode(nodeId)}
        className="w-full space-y-1 rounded border border-outline-variant bg-surface-container-lowest p-3 text-left hover:border-primary disabled:cursor-default disabled:hover:border-outline-variant"
      >
        <span className="flex items-center gap-2">
          <Icon className={`h-3.5 w-3.5 shrink-0 ${error ? "text-error" : "text-primary-fixed"}`} aria-hidden="true" />
          <span className={`font-mono text-label ${error ? "text-error" : "text-primary-fixed"}`}>{issue.code}</span>
          {nodeId ? <span className="ml-auto font-mono text-[10px] text-on-surface-variant">{nodeId}</span> : null}
        </span>
        <span className="block text-[13px] text-on-surface">{issue.message}</span>
        {issue.path ? <span className="block font-mono text-[11px] text-on-surface-variant">{issue.path}</span> : null}
        {issue.suggestions && issue.suggestions.length > 0 ? (
          <ul className="list-disc space-y-0.5 pl-4 text-[12px] text-on-surface-variant">
            {issue.suggestions.map((suggestion) => (
              <li key={suggestion}>{suggestion}</li>
            ))}
          </ul>
        ) : null}
      </button>
    </li>
  )
}

/**
 * Validation issues of the open execution. Clicking an issue selects its node.
 * @category App
 */
export function ValidationView({ validation, manifest, loadError, onSelectNode }: ValidationViewProps) {
  return (
    <section data-testid="validation-view" data-valid={validation ? String(validation.valid) : ""} className="space-y-3">
      {loadError ? (
        <p className="text-[12px] text-on-surface-variant">
          The file failed to load, so these issues are from the last good version.
        </p>
      ) : null}
      {!validation ? (
        <p className="text-[12px] text-on-surface-variant">Validating…</p>
      ) : validation.issues.length === 0 ? (
        <p data-testid="validation-clean" className="flex items-center gap-2 text-[13px] text-status-valid-text">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          No issues. The execution is valid.
        </p>
      ) : (
        <ul className="space-y-2">
          {validation.issues.map((issue, index) => (
            <IssueItem
              key={`${issue.code}-${issue.path}-${index}`}
              issue={issue}
              nodeId={issueNodeId(issue, manifest)}
              onSelectNode={onSelectNode}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
