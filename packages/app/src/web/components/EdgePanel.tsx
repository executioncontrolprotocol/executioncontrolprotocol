import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, GitBranch, Save } from "lucide-react"
import type { ExecutionManifest, ValidationIssue } from "@executioncontrolprotocol/protocol"
import { UnauthorizedError, validationFromExecute, type AppHostClient } from "../../client/index.js"
import {
  applyDataEdgeDraft,
  applyRouteEdgeDraft,
  dataEdgeEditable,
  dataEdgeInspectorMeta,
  exprIssuesAtPointer,
  routeEdgeEditable,
  routeEdgeInspectorMeta,
  type ReactFlowDataEdgeData,
  type ReactFlowEdge,
  type ReactFlowRouteEdgeData,
} from "../../graph/index.js"
import type { ExecutionSource } from "../hooks/useExecutionDocument.js"
import {
  formatPayloadJson,
  truncatePayloadPreview,
  useEdgeRunPayload,
  type EdgeRunPayload,
} from "../hooks/useEdgeRunPayload.js"

/**
 * Props for {@link EdgePanel}.
 * @category App
 */
export interface EdgePanelProps {
  client: AppHostClient
  source: ExecutionSource
  storedVersion?: number
  manifest?: ExecutionManifest
  draft?: ExecutionManifest
  onDraftChange: (manifest: ExecutionManifest | undefined) => void
  edge?: ReactFlowEdge
  /** Route stack level to inspect (`0` for data edges and path clicks). */
  level?: number
  runId?: string
  runSource: "live" | "replay" | "none"
  onUnauthorized: () => void
}

function PayloadBlock({
  label,
  payload,
  value,
}: {
  label: string
  payload: EdgeRunPayload
  value: unknown
}) {
  const text = formatPayloadJson(value)
  const { preview, truncated } = truncatePayloadPreview(text)
  const empty = text.length === 0
  return (
    <details data-testid={`edge-payload-${label}`} open={!empty} className="rounded border border-outline-variant bg-surface-container-lowest">
      <summary className="cursor-pointer px-3 py-2 font-mono text-label uppercase text-on-surface-variant">{label}</summary>
      <div className="space-y-1 px-3 pb-3">
        <p className="font-mono text-[10px] text-on-surface-variant" data-testid={`edge-payload-${label}-source`}>
          {payload.source === "none"
            ? "No run selected"
            : payload.stepPending
              ? "Step not run yet"
              : `Run ${payload.runId ?? ""} (${payload.source})`}
        </p>
        {empty ? (
          <p className="text-[11px] text-on-surface-variant">No value</p>
        ) : (
          <pre className="max-h-48 overflow-auto font-mono text-[11px] text-on-surface">{truncated ? preview : text}</pre>
        )}
        {truncated ? (
          <details>
            <summary className="cursor-pointer text-[11px] text-primary">Show full JSON</summary>
            <pre className="mt-1 max-h-72 overflow-auto font-mono text-[11px] text-on-surface">{text}</pre>
          </details>
        ) : null}
      </div>
    </details>
  )
}

function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null
  return (
    <ul className="space-y-1" data-testid="edge-expr-issues">
      {issues.map((issue, index) => (
        <li key={`${issue.path}-${index}`} className="flex gap-2 text-[11px] text-error">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-mono">{issue.code}</span> {issue.message}
            {issue.line !== undefined ? (
              <span className="text-on-surface-variant">
                {" "}
                (line {issue.line}
                {issue.column !== undefined ? `, col ${issue.column}` : ""})
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Inspector for a selected data or route edge: marker metadata, run payloads, and `$expr` editing.
 * @category App
 */
export function EdgePanel({
  client,
  source,
  storedVersion,
  manifest,
  draft,
  onDraftChange,
  edge,
  level = 0,
  runId,
  runSource,
  onUnauthorized,
}: EdgePanelProps) {
  const effective = draft ?? manifest
  const [exprText, setExprText] = useState("")
  const [validatePointer, setValidatePointer] = useState("")
  const [exprIssues, setExprIssues] = useState<ValidationIssue[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | undefined>(undefined)

  const dataMeta = useMemo(() => {
    if (!effective || !edge || edge.data.kind !== "data") return undefined
    return dataEdgeInspectorMeta(effective, edge.target, (edge.data as ReactFlowDataEdgeData).inputPath)
  }, [effective, edge])

  const routeMeta = useMemo(() => {
    if (!effective || !edge || edge.data.kind !== "route") return undefined
    return routeEdgeInspectorMeta(effective, edge.data as ReactFlowRouteEdgeData, level)
  }, [effective, edge, level])

  const editable =
    edge?.data.kind === "data" ? dataEdgeEditable(dataMeta) : edge?.data.kind === "route" ? routeEdgeEditable(routeMeta) : false

  const savedExpr = useMemo(() => {
    if (!manifest || !edge) return ""
    if (edge.data.kind === "data") {
      const data = edge.data as ReactFlowDataEdgeData
      return dataEdgeInspectorMeta(manifest, edge.target, data.inputPath)?.exprSource ?? ""
    }
    if (edge.data.kind === "route") {
      return routeEdgeInspectorMeta(manifest, edge.data as ReactFlowRouteEdgeData, level)?.exprSource ?? ""
    }
    return ""
  }, [manifest, edge, level])

  useEffect(() => {
    setExprText(savedExpr)
    const pointer =
      edge?.data.kind === "data"
        ? (manifest && edge
            ? dataEdgeInspectorMeta(manifest, edge.target, (edge.data as ReactFlowDataEdgeData).inputPath)?.validatePointer
            : "") ?? ""
        : edge?.data.kind === "route"
          ? (manifest && edge ? routeEdgeInspectorMeta(manifest, edge.data as ReactFlowRouteEdgeData, level)?.validatePointer : "") ?? ""
          : ""
    setValidatePointer(pointer)
    setExprIssues([])
    setSaveError(undefined)
  }, [edge?.id, level, savedExpr, manifest, edge])

  const dataEdge = edge?.data.kind === "data" ? (edge.data as ReactFlowDataEdgeData) : undefined
  const payload = useEdgeRunPayload(
    client,
    runId,
    runSource,
    edge?.target ?? "",
    dataMeta?.refPath ?? dataEdge?.statePath,
    dataEdge?.inputPath ?? "",
  )

  const validateDraft = useCallback(
    async (nextManifest: ExecutionManifest) => {
      const response = await client.execute({ mode: "validate", execution: nextManifest })
      const validation = validationFromExecute(response)
      const pointer =
        edge?.data.kind === "data" ? dataMeta?.validatePointer : edge?.data.kind === "route" ? routeMeta?.validatePointer : ""
      setExprIssues(exprIssuesAtPointer(validation.issues, pointer ?? ""))
      return validation
    },
    [client, edge?.data.kind, dataMeta?.validatePointer, routeMeta?.validatePointer],
  )

  useEffect(() => {
    if (!editable || !effective || exprText === savedExpr) {
      setExprIssues([])
      return
    }
    let alive = true
    const handle = setTimeout(() => {
      void (async () => {
        let next = effective
        if (edge?.data.kind === "data" && dataEdge) {
          const applied = applyDataEdgeDraft(effective, edge.target, dataEdge, exprText)
          if (applied) next = applied
        } else if (edge?.data.kind === "route") {
          const applied = applyRouteEdgeDraft(effective, edge.data as ReactFlowRouteEdgeData, exprText, level)
          if (applied) next = applied
        }
        if (!alive) return
        onDraftChange(next)
        try {
          await validateDraft(next)
        } catch (error) {
          if (error instanceof UnauthorizedError) onUnauthorized()
        }
      })()
    }, 300)
    return () => {
      alive = false
      clearTimeout(handle)
    }
  }, [
    editable,
    effective,
    exprText,
    savedExpr,
    edge,
    dataEdge,
    onDraftChange,
    validateDraft,
    level,
    onUnauthorized,
  ])

  const saveDisabled = exprIssues.length > 0 || !draft || saving || exprText === savedExpr

  const onSave = useCallback(() => {
    if (!draft || saveDisabled) return
    setSaving(true)
    setSaveError(undefined)
    void (async () => {
      try {
        const validation = await validateDraft(draft)
        if (!validation.valid && exprIssuesAtPointer(validation.issues, validatePointer).length > 0) {
          setSaveError("Fix expression errors before saving.")
          return
        }
        if (source.kind === "path") {
          await client.putFile(source.path, `${JSON.stringify(draft, null, 2)}\n`)
        } else if (storedVersion !== undefined) {
          const response = await client.commit({
            type: "execution",
            action: "update",
            object: draft,
            ifVersion: storedVersion,
          })
          if (!response.ok) {
            setSaveError(response.error.message)
            return
          }
        } else {
          setSaveError("Stored version is not loaded.")
          return
        }
        onDraftChange(undefined)
      } catch (error) {
        if (error instanceof UnauthorizedError) onUnauthorized()
        else setSaveError(error instanceof Error ? error.message : String(error))
      } finally {
        setSaving(false)
      }
    })()
  }, [client, draft, onDraftChange, onUnauthorized, saveDisabled, source, storedVersion, validateDraft, validatePointer])

  if (!edge) {
    return (
      <section data-testid="edge-panel" className="space-y-2 text-[12px] text-on-surface-variant">
        <p>Select a data or route edge to inspect bindings and expressions.</p>
      </section>
    )
  }

  const isData = edge.data.kind === "data"
  const isRoute = edge.data.kind === "route"

  return (
    <section data-testid="edge-panel" data-edge-id={edge.id} className="space-y-4">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-on-surface">
          <GitBranch className="h-4 w-4 text-primary" aria-hidden="true" />
          Edge
        </h3>
        <p className="font-mono text-[11px] text-on-surface-variant">
          {edge.source} → {edge.target}
        </p>
      </header>

      {isData && dataMeta ? (
        <div className="space-y-2 text-[12px]">
          <p className="font-mono text-label uppercase text-on-surface-variant">Binding</p>
          {dataMeta.markerKind === "ref" ? (
            <ul className="space-y-1 font-mono text-[11px] text-on-surface">
              <li data-testid="edge-ref-path">$ref {dataMeta.refPath}</li>
              {dataMeta.optional ? <li data-testid="edge-ref-optional">optional</li> : null}
              {dataMeta.optional && dataMeta.fallback !== undefined ? (
                <li data-testid="edge-ref-fallback">fallback {JSON.stringify(dataMeta.fallback)}</li>
              ) : null}
            </ul>
          ) : (
            <p className="font-mono text-[11px] text-on-surface">$expr</p>
          )}
        </div>
      ) : null}

      {isRoute && routeMeta ? (
        <div className="space-y-1 text-[12px]">
          <p className="font-mono text-label uppercase text-on-surface-variant">Route</p>
          {routeMeta.defaultArm ? (
            <p data-testid="edge-route-default" className="text-on-surface-variant">
              Default arm (no expr)
            </p>
          ) : (
            <p className="font-mono text-[11px] text-on-surface">expr</p>
          )}
        </div>
      ) : null}

      {isData && dataMeta?.markerKind === "ref" ? null : editable ? (
        <div className="space-y-2">
          <label className="font-mono text-label uppercase text-on-surface-variant" htmlFor="edge-expr-editor">
            Expression
          </label>
          <textarea
            id="edge-expr-editor"
            data-testid="edge-expr-editor"
            className="min-h-[120px] w-full rounded border border-outline-variant bg-surface-container-lowest p-2 font-mono text-[11px] text-on-surface"
            value={exprText}
            onChange={(event) => setExprText(event.target.value)}
          />
          <IssueList issues={exprIssues} />
        </div>
      ) : null}

      {isData && dataMeta ? (
        <div className="space-y-2">
          <p className="font-mono text-label uppercase text-on-surface-variant">Payload</p>
          <PayloadBlock label="source" payload={payload} value={payload.sourceValue} />
          <PayloadBlock label="target" payload={payload} value={payload.targetValue} />
        </div>
      ) : null}

      {editable && draft ? (
        <div className="space-y-2">
          <button
            type="button"
            data-testid="edge-save"
            disabled={saveDisabled}
            onClick={onSave}
            className="inline-flex items-center gap-2 rounded bg-primary px-3 py-2 font-mono text-label text-on-primary disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            {saving ? "Saving…" : "Save"}
          </button>
          {saveError ? (
            <p className="text-[11px] text-error" data-testid="edge-save-error">
              {saveError}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}