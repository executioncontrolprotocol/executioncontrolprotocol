import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, GitBranch, Save } from "lucide-react"
import type { ExecutionManifest, ValidationIssue } from "@executioncontrolprotocol/protocol"
import { UnauthorizedError, validationFromExecute, type AppHostClient } from "../../client/index.js"
import { executionUpdateInput, interpretCommitResponse, isExecutionUpdateRefusal } from "../../client/document-state.js"
import {
  addArmCondition,
  applyDataEdgeDraft,
  applyRouteEdgeDraft,
  dataEdgeEditable,
  dataEdgeInspectorMeta,
  exprIssuesAtPointer,
  makeDefaultArm,
  routeEdgeEditable,
  routeEdgeInspectorMeta,
  setArmLabel,
  type ReactFlowDataEdgeData,
  type ReactFlowEdge,
  type ReactFlowRouteEdgeData,
  type AddStepPlacement,
  type StructureEditResult,
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
  version?: number | string
  applyCommit: (manifest: ExecutionManifest, nextVersion: number | string, issues: readonly ValidationIssue[]) => void
  onVersionConflict: () => void
  manifest?: ExecutionManifest
  draft?: ExecutionManifest
  onDraftChange: (manifest: ExecutionManifest | undefined) => void
  edge?: ReactFlowEdge
  /** Route stack level to inspect (`0` for data edges and path clicks). */
  level?: number
  runId?: string
  runSource: "live" | "replay" | "none"
  onUnauthorized: () => void
  readOnly?: boolean
  applyManifestEdit?: (edit: (manifest: ExecutionManifest) => StructureEditResult) => Promise<boolean>
  /** Open the capability menu to add a new arm on this branch. */
  onOpenCapabilityMenu?: (clientX: number, clientY: number, placement: AddStepPlacement) => void
}

function RouteArmFields({
  manifest,
  branchId,
  armIndex,
  defaultArm,
  readOnly,
  applyManifestEdit,
  onAddArm,
}: {
  manifest: ExecutionManifest
  branchId: string
  armIndex: number
  defaultArm?: boolean
  readOnly: boolean
  applyManifestEdit: (edit: (manifest: ExecutionManifest) => StructureEditResult) => Promise<boolean>
  onAddArm?: (clientX: number, clientY: number) => void
}) {
  const armLabel = useMemo(() => {
    const walk = (nodes: ExecutionManifest["steps"]): string => {
      for (const node of nodes) {
        if (node.type === "branch" && node.id === branchId) {
          return node.branches[armIndex]?.label ?? ""
        }
        if (node.type === "branch") {
          for (const arm of node.branches) {
            const hit = walk(arm.steps)
            if (hit) return hit
          }
        } else if (node.type === "parallel") {
          for (const line of node.branches) {
            const hit = walk(line)
            if (hit) return hit
          }
        } else if (node.type === "loop") {
          const hit = walk(node.steps)
          if (hit) return hit
        }
      }
      return ""
    }
    return walk(manifest.steps)
  }, [manifest, branchId, armIndex])

  const saveLabel = useCallback(
    (nextLabel: string) => {
      if (readOnly) return
      void applyManifestEdit((current) => setArmLabel(current, branchId, armIndex, nextLabel))
    },
    [applyManifestEdit, armIndex, branchId, readOnly],
  )

  return (
    <div className="space-y-2 border-t border-outline-variant pt-2">
      <label className="font-mono text-label uppercase text-on-surface-variant" htmlFor="edge-arm-label">
        Arm label
      </label>
      <input
        id="edge-arm-label"
        data-testid="edge-arm-label"
        className="w-full rounded border border-outline-variant bg-surface-container-lowest px-2 py-1 font-mono text-[11px]"
        defaultValue={armLabel}
        disabled={readOnly}
        onBlur={(event) => saveLabel(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") saveLabel((event.target as HTMLInputElement).value)
        }}
      />
      {defaultArm ? (
        <button
          type="button"
          data-testid="edge-arm-add-condition"
          disabled={readOnly}
          className="rounded border border-outline-variant px-2 py-1 text-[11px] disabled:opacity-40"
          onClick={() => void applyManifestEdit((current) => addArmCondition(current, branchId, armIndex))}
        >
          Add condition
        </button>
      ) : (
        <button
          type="button"
          data-testid="edge-arm-make-default"
          disabled={readOnly}
          className="rounded border border-outline-variant px-2 py-1 text-[11px] disabled:opacity-40"
          onClick={() => void applyManifestEdit((current) => makeDefaultArm(current, branchId, armIndex))}
        >
          Make default
        </button>
      )}
      {readOnly || !onAddArm ? null : (
        <button
          type="button"
          data-testid="edge-add-arm"
          className="rounded border border-outline-variant px-2 py-1 text-[11px]"
          onClick={(event) => onAddArm(event.clientX, event.clientY)}
        >
          Add arm
        </button>
      )}
    </div>
  )
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
  version,
  applyCommit,
  onVersionConflict,
  manifest,
  draft,
  onDraftChange,
  edge,
  level = 0,
  runId,
  runSource,
  onUnauthorized,
  readOnly = false,
  applyManifestEdit,
  onOpenCapabilityMenu,
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

  const routeLevel =
    edge?.data.kind === "route" ? (edge.data as ReactFlowRouteEdgeData).levels[level] : undefined

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

  const saveDisabled =
    exprIssues.length > 0 || !draft || saving || exprText === savedExpr || version === undefined

  const onSave = useCallback(() => {
    if (!draft || saveDisabled) return
    setSaving(true)
    setSaveError(undefined)
    void (async () => {
      try {
        let toSave = draft
        if (edge?.data.kind === "data" && dataEdge) {
          const applied = applyDataEdgeDraft(draft, edge.target, dataEdge, exprText)
          if (applied) toSave = applied
        } else if (edge?.data.kind === "route") {
          const applied = applyRouteEdgeDraft(draft, edge.data as ReactFlowRouteEdgeData, exprText, level)
          if (applied) toSave = applied
        }
        const validation = await validateDraft(toSave)
        if (!validation.valid && exprIssuesAtPointer(validation.issues, validatePointer).length > 0) {
          setSaveError("Fix expression errors before saving.")
          return
        }
        const input = executionUpdateInput(source, toSave, version)
        if (isExecutionUpdateRefusal(input)) {
          setSaveError(input.error)
          return
        }
        const response = await client.commit(input)
        const outcome = interpretCommitResponse(response)
        if (!outcome.ok) {
          if ("versionConflict" in outcome && outcome.versionConflict) {
            onVersionConflict()
            return
          }
          setSaveError("message" in outcome ? outcome.message : "Commit refused.")
          return
        }
        applyCommit(toSave, outcome.version, outcome.issues)
        onDraftChange(undefined)
      } catch (error) {
        if (error instanceof UnauthorizedError) onUnauthorized()
        else setSaveError(error instanceof Error ? error.message : String(error))
      } finally {
        setSaving(false)
      }
    })()
  }, [
    applyCommit,
    client,
    dataEdge,
    draft,
    edge?.data.kind,
    exprText,
    level,
    onDraftChange,
    onUnauthorized,
    onVersionConflict,
    saveDisabled,
    source,
    version,
    validateDraft,
    validatePointer,
  ])

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
        <div className="space-y-2 text-[12px]">
          <p className="font-mono text-label uppercase text-on-surface-variant">Route</p>
          {routeMeta.defaultArm ? (
            <p data-testid="edge-route-default" className="text-on-surface-variant">
              Default arm (no expr)
            </p>
          ) : (
            <p className="font-mono text-[11px] text-on-surface">expr</p>
          )}
          {routeLevel?.route === "branch" &&
          routeLevel.structureId !== undefined &&
          routeLevel.armIndex !== undefined &&
          effective &&
          applyManifestEdit ? (
            <RouteArmFields
              manifest={effective}
              branchId={routeLevel.structureId}
              armIndex={routeLevel.armIndex}
              defaultArm={routeLevel.defaultArm ?? routeMeta?.defaultArm}
              readOnly={readOnly}
              applyManifestEdit={applyManifestEdit}
              onAddArm={
                onOpenCapabilityMenu
                  ? (clientX, clientY) =>
                      onOpenCapabilityMenu(clientX, clientY, {
                        kind: "new-arm",
                        branchId: routeLevel.structureId!,
                      })
                  : undefined
              }
            />
          ) : null}
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