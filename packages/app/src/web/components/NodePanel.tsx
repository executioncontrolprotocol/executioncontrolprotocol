import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { AlertTriangle, Box, FileCode2, Save } from "lucide-react"
import type {
  CapabilityEntry,
  ExecutionManifest,
  LoopNode,
  Node,
  ScriptDescriptor,
  StepNode,
  ValidationIssue,
} from "@executioncontrolprotocol/protocol"
import { resolveScriptPath, UnauthorizedError, type AppHostClient } from "../../client/index.js"
import {
  collectSteps,
  type ReactFlowIoData,
  type ReactFlowNode,
  type ReactFlowLoopItemsData,
  type ReactFlowPort,
  type ReactFlowStepData,
  type RunGraphLoop,
  type RunGraphLoopItems,
  type RunGraphStep,
} from "../../graph/index.js"
import type { ExecutionSource } from "../hooks/useExecutionDocument.js"

/**
 * Props for {@link NodePanel}.
 * @category App
 */
export interface NodePanelProps {
  /** Host client, for `$script.path` text and saves. */
  client: AppHostClient
  /** How the execution was opened (path vs id). */
  source: ExecutionSource
  /** Stored version for id-backed commits. */
  storedVersion?: number
  /** Draft manifest while editing; `undefined` when the panel is read-only. */
  draft?: ExecutionManifest
  /** Update or clear the workspace draft. */
  onDraftChange: (manifest: ExecutionManifest | undefined) => void
  /** Open execution manifest (includes unsaved draft). */
  manifest?: ExecutionManifest
  /** Execution file path, when opened by path (resolves relative script paths). */
  executionPath?: string
  /** Selected graph node, if any. */
  node?: ReactFlowNode
  /** Capability entry of the selected step. */
  capability?: CapabilityEntry
  /** Validation issues on the selected node. */
  issues: ValidationIssue[]
  /** Run status of the selected node. */
  runStep?: RunGraphStep
  /** Run progress when the selected node is a `forEach` loop. */
  runLoopItems?: RunGraphLoopItems
  /** Run round when the selected node is a `while` / `for` loop. */
  runLoop?: RunGraphLoop
  /** Changes on every reload, so script text is fetched again. */
  reloadKey: number
  /** Switch the App to its unauthorised screen. */
  onUnauthorized: () => void
}

function findStep(manifest: ExecutionManifest | undefined, id: string): StepNode | undefined {
  if (!manifest || !Array.isArray(manifest.steps)) return undefined
  const steps: StepNode[] = []
  collectSteps(manifest.steps, steps)
  return steps.find((step) => step.id === id)
}

function findLoop(manifest: ExecutionManifest | undefined, id: string): LoopNode | undefined {
  if (!manifest || !Array.isArray(manifest.steps)) return undefined
  const walk = (nodes: Node[]): LoopNode | undefined => {
    for (const node of nodes) {
      if (node.type === "loop" && node.id === id) return node
      if (node.type === "parallel") {
        for (const line of node.branches) {
          const hit = walk(line)
          if (hit) return hit
        }
      } else if (node.type === "branch") {
        for (const arm of node.branches) {
          const hit = walk(arm.steps)
          if (hit) return hit
        }
      } else if (node.type === "loop") {
        const hit = walk(node.steps)
        if (hit) return hit
      }
    }
    return undefined
  }
  return walk(manifest.steps)
}

function patchStep(
  manifest: ExecutionManifest,
  stepId: string,
  patch: (step: StepNode) => StepNode,
): ExecutionManifest {
  const walk = (nodes: Node[]): Node[] =>
    nodes.map((node) => {
      if (node.type === "branch") {
        return {
          ...node,
          branches: node.branches.map((arm) => ({ ...arm, steps: walk(arm.steps) })),
        }
      }
      if (node.type === "loop") return { ...node, steps: walk(node.steps) }
      if (node.type === "parallel") return { ...node, branches: node.branches.map((branch) => walk(branch)) }
      if ((node as StepNode).id === stepId) return patch(node as StepNode)
      return node
    })
  return { ...manifest, steps: walk(manifest.steps) }
}

function LoopItemsPanel({
  node,
  data,
  manifest,
  issues,
  loopRun,
  loopRound,
}: {
  node: ReactFlowNode
  data: ReactFlowLoopItemsData
  manifest?: ExecutionManifest
  issues: ValidationIssue[]
  loopRun?: RunGraphLoopItems
  loopRound?: RunGraphLoop
}) {
  const source = findLoop(manifest, node.id)
  const mode = data.mode ?? "while"
  return (
    <section data-testid="node-panel" data-node-id={node.id} className="space-y-4">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-on-surface">
          <Box className="h-4 w-4 text-primary" aria-hidden="true" />
          {data.label}
        </h3>
        <p className="text-[12px] text-on-surface-variant">Loop ({mode} mode, read-only in the App).</p>
      </header>
      <div className="space-y-1.5">
        <Row label="Kind">loop</Row>
        <Row label="Id">{node.id}</Row>
        <Row label="Mode">{mode}</Row>
        {data.refPath !== undefined || source?.ref ? (
          <Row label="Ref">
            {data.refPath ? `state.${data.refPath}` : (source?.ref ?? "")}
          </Row>
        ) : null}
        {source?.expr ?? data.exprBadge ? (
          <Row label="Expr">{source?.expr ?? data.exprBadge}</Row>
        ) : null}
        {data.as !== undefined ? <Row label="As">{data.as}</Row> : null}
        {mode === "forEach" ? (
          <>
            <Row label="Collect">
              {data.collectPath ? data.collectPath : (source?.collect ?? "")}
            </Row>
            <Row label="Into">{data.into}</Row>
            <Row label="Concurrency">{data.concurrency}</Row>
            <Row label="On error">{data.onError}</Row>
          </>
        ) : null}
        {mode === "while" && data.maxRounds !== undefined ? <Row label="Max rounds">{data.maxRounds}</Row> : null}
        {loopRun ? (
          <Row label="Progress">
            {loopRun.done} / {loopRun.count}
            {loopRun.failed > 0 ? ` (${loopRun.failed} failed)` : ""}
          </Row>
        ) : null}
        {loopRound ? <Row label="Round">{loopRound.round + 1}</Row> : null}
      </div>
      {issues.length > 0 ? (
        <ul className="space-y-2">
          {issues.map((issue, index) => (
            <li key={`${issue.code}-${index}`} className="flex gap-2 rounded border border-error/40 p-2 text-[12px]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-error" aria-hidden="true" />
              <span>
                <span className="font-mono text-error">{issue.code}</span> {issue.message}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2 text-[12px]">
      <span className="font-mono text-label uppercase text-on-surface-variant">{label}</span>
      <span className="min-w-0 break-all font-mono text-on-surface">{children}</span>
    </div>
  )
}

function JsonBlock({ title, value, testId }: { title: string; value: unknown; testId: string }) {
  return (
    <details data-testid={testId} className="rounded border border-outline-variant bg-surface-container-lowest">
      <summary className="cursor-pointer px-3 py-2 font-mono text-label uppercase text-on-surface-variant">{title}</summary>
      <pre className="max-h-72 overflow-auto px-3 pb-3 font-mono text-[11px] text-on-surface">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  )
}

function ReadOnlyFileBody({ client, path, reloadKey }: { client: AppHostClient; path: string; reloadKey: number }) {
  const [text, setText] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  useEffect(() => {
    let alive = true
    setError(undefined)
    client
      .getFile(path)
      .then((body) => alive && setText(body))
      .catch((caught: unknown) => {
        if (!alive || caught instanceof UnauthorizedError) return
        setError(caught instanceof Error ? caught.message : String(caught))
      })
    return () => {
      alive = false
    }
  }, [client, path, reloadKey])
  if (error) return <p className="text-[11px] text-error">{error}</p>
  return (
    <pre data-testid="node-input-script-file" className="max-h-72 overflow-auto rounded bg-surface-container-lowest p-2 font-mono text-[11px] text-on-surface">
      {text ?? "Loading…"}
    </pre>
  )
}

function ScriptText({
  client,
  path,
  reloadKey,
  editable,
  text,
  onTextChange,
  onSave,
  saving,
  saveError,
}: {
  client: AppHostClient
  path: string
  reloadKey: number
  editable: boolean
  text: string
  onTextChange: (next: string) => void
  onSave: () => void
  saving: boolean
  saveError?: string
}) {
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let alive = true
    setLoadError(undefined)
    setLoaded(false)
    client
      .getFile(path)
      .then((body) => {
        if (!alive) return
        setLoaded(true)
        onTextChange(body)
      })
      .catch((caught: unknown) => {
        if (!alive || caught instanceof UnauthorizedError) return
        setLoadError(caught instanceof Error ? caught.message : String(caught))
      })
    return () => {
      alive = false
    }
  }, [client, path, reloadKey, onTextChange])
  if (loadError) return <p className="text-[11px] text-error">{loadError}</p>
  if (!editable) {
    return (
      <pre data-testid="node-script" className="max-h-72 overflow-auto rounded bg-surface-container-lowest p-2 font-mono text-[11px] text-on-surface">
        {loaded ? text : "Loading…"}
      </pre>
    )
  }
  return (
    <div className="space-y-2">
      <textarea
        data-testid="node-script-editor"
        className="min-h-[120px] w-full rounded border border-outline-variant bg-surface-container-lowest p-2 font-mono text-[11px] text-on-surface"
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        disabled={!loaded || saving}
      />
      {saveError ? <p className="text-[11px] text-error">{saveError}</p> : null}
      <button
        type="button"
        data-testid="node-script-save"
        className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 font-mono text-[11px] text-on-primary disabled:opacity-50"
        disabled={!loaded || saving}
        onClick={onSave}
      >
        <Save className="h-3 w-3" aria-hidden="true" />
        Save script file
      </button>
    </div>
  )
}

function bindingSummary(port: ReactFlowPort): string {
  if (port.binding === "ref") return `ref ${port.refPath ?? ""}${port.refOptional ? " (optional)" : ""}`
  if (port.binding === "expr") return "expr"
  if (port.binding === "script") return port.scriptPath ? `script ${port.scriptPath}` : "script (inline)"
  if (port.binding === "literal") return port.valueTitle ?? port.valuePreview ?? "literal"
  return "not set"
}

function InputBinding({
  port,
  client,
  executionPath,
  reloadKey,
}: {
  port: ReactFlowPort
  client: AppHostClient
  executionPath?: string
  reloadKey: number
}) {
  const scriptPath = port.scriptPath
    ? executionPath
      ? resolveScriptPath(executionPath, port.scriptPath)
      : port.scriptPath
    : undefined
  return (
    <li data-testid="node-input" data-name={port.name} data-binding={port.binding ?? "unset"} className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 font-mono text-[12px]">
        <span className="text-on-surface">
          {port.name}
          <span className="text-outline">:{port.typeLabel}</span>
        </span>
        <span className="rounded bg-surface-container-high px-1.5 py-0.5 text-[10px] uppercase text-on-surface-variant">
          {port.binding ?? "unset"}
        </span>
      </div>
      <p className="break-all font-mono text-[11px] text-on-surface-variant">{bindingSummary(port)}</p>
      {port.binding === "expr" && port.exprSource ? (
        <pre className="overflow-auto rounded bg-surface-container-lowest p-2 font-mono text-[11px] text-primary-fixed">
          {port.exprSource}
        </pre>
      ) : null}
      {port.binding === "script" && port.scriptSource ? (
        <pre data-testid="node-input-script" className="max-h-72 overflow-auto rounded bg-surface-container-lowest p-2 font-mono text-[11px] text-on-surface">
          {port.scriptSource}
        </pre>
      ) : null}
      {scriptPath ? (
        <div className="space-y-1">
          <p className="flex items-center gap-1 font-mono text-[10px] text-on-surface-variant">
            <FileCode2 className="h-3 w-3" aria-hidden="true" />
            {scriptPath}
          </p>
          <ReadOnlyFileBody client={client} path={scriptPath} reloadKey={reloadKey} />
        </div>
      ) : null}
    </li>
  )
}

function IoPanel({ node, manifest }: { node: ReactFlowNode; manifest?: ExecutionManifest }) {
  const data = node.data as ReactFlowIoData
  const schema = data.kind === "accepts" ? manifest?.execution?.accepts : manifest?.execution?.returns
  return (
    <section data-testid="node-panel" data-node-id={node.id} className="space-y-3">
      <h3 className="font-display text-lg font-semibold text-on-surface">{data.label}</h3>
      <Row label="Contract">execution.{data.kind}</Row>
      {schema ? (
        <JsonBlock title={`${data.kind} schema`} value={schema} testId="node-io-schema" />
      ) : (
        <p className="text-[12px] text-on-surface-variant">This execution declares no {data.kind} schema.</p>
      )}
    </section>
  )
}

function TransformCodePanel({
  client,
  source,
  storedVersion,
  manifest,
  draft,
  onDraftChange,
  step,
  capability,
  reloadKey,
  executionPath,
  onUnauthorized,
}: {
  client: AppHostClient
  source: ExecutionSource
  storedVersion?: number
  manifest: ExecutionManifest
  draft?: ExecutionManifest
  onDraftChange: (manifest: ExecutionManifest | undefined) => void
  step: StepNode
  capability?: CapabilityEntry
  reloadKey: number
  executionPath?: string
  onUnauthorized: () => void
}) {
  const editable = source.kind === "path" || storedVersion !== undefined
  const effective = draft ?? manifest
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | undefined>(undefined)
  const code = capability?.code

  const inlineScript = step.script?.source ?? ""
  const pathScript = step.script?.path
  const resolvedPath =
    pathScript && executionPath ? resolveScriptPath(executionPath, pathScript) : pathScript
  const [pathText, setPathText] = useState("")
  const [sourceText, setSourceText] = useState(inlineScript)
  const [expressionText, setExpressionText] = useState(step.expression ?? "")

  useEffect(() => {
    setSourceText(step.script?.source ?? "")
    setExpressionText(step.expression ?? "")
  }, [step.script?.source, step.expression, step.id])

  const persistManifest = useCallback(
    async (next: ExecutionManifest): Promise<boolean> => {
      onDraftChange(next)
      try {
        if (source.kind === "path") {
          await client.putFile(source.path, `${JSON.stringify(next, null, 2)}\n`)
        } else if (storedVersion !== undefined) {
          const response = await client.commit({
            type: "execution",
            action: "update",
            object: next,
            ifVersion: storedVersion,
          })
          if (!response.ok) {
            setSaveError(response.error.message)
            return false
          }
        } else {
          setSaveError("Stored version is not loaded.")
          return false
        }
        onDraftChange(undefined)
        return true
      } catch (error) {
        if (error instanceof UnauthorizedError) onUnauthorized()
        else setSaveError(error instanceof Error ? error.message : String(error))
        return false
      }
    },
    [client, onDraftChange, onUnauthorized, source, storedVersion],
  )

  const onSaveInlineScript = useCallback(() => {
    if (code !== "script" || step.script?.source === undefined) return
    setSaving(true)
    setSaveError(undefined)
    void (async () => {
      const script: ScriptDescriptor = { lang: "js", source: sourceText }
      const next = patchStep(effective, step.id, (current) => ({ ...current, script }))
      await persistManifest(next)
      setSaving(false)
    })()
  }, [code, effective, pathScript, persistManifest, sourceText, step.id])

  const onSavePathScript = useCallback(() => {
    if (!resolvedPath) return
    setSaving(true)
    setSaveError(undefined)
    void (async () => {
      try {
        await client.putFile(resolvedPath, pathText.endsWith("\n") ? pathText : `${pathText}\n`)
        setSaving(false)
      } catch (error) {
        if (error instanceof UnauthorizedError) onUnauthorized()
        else setSaveError(error instanceof Error ? error.message : String(error))
        setSaving(false)
      }
    })()
  }, [client, onUnauthorized, pathText, resolvedPath])

  const onSaveExpression = useCallback(() => {
    if (code !== "expression") return
    setSaving(true)
    setSaveError(undefined)
    void (async () => {
      const next = patchStep(effective, step.id, (current) => ({ ...current, expression: expressionText }))
      await persistManifest(next)
      setSaving(false)
    })()
  }, [code, effective, expressionText, persistManifest, step.id])

  if (code === "script") {
    const hasInline = step.script?.source !== undefined
    const hasPath = Boolean(resolvedPath)
    return (
      <div className="space-y-3">
        <p className="font-mono text-label uppercase text-on-surface-variant">Transform script</p>
        {hasInline ? (
          editable ? (
            <div className="space-y-2">
              <textarea
                data-testid="node-transform-script"
                className="min-h-[120px] w-full rounded border border-outline-variant bg-surface-container-lowest p-2 font-mono text-[11px] text-on-surface"
                value={sourceText}
                onChange={(event) => setSourceText(event.target.value)}
                disabled={saving}
              />
              {saveError ? <p className="text-[11px] text-error">{saveError}</p> : null}
              <button
                type="button"
                data-testid="node-transform-script-save"
                className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 font-mono text-[11px] text-on-primary disabled:opacity-50"
                disabled={saving || sourceText === inlineScript}
                onClick={onSaveInlineScript}
              >
                <Save className="h-3 w-3" aria-hidden="true" />
                Save script
              </button>
            </div>
          ) : (
            <pre className="max-h-72 overflow-auto rounded bg-surface-container-lowest p-2 font-mono text-[11px] text-on-surface">
              {inlineScript}
            </pre>
          )
        ) : null}
        {hasPath ? (
          <ScriptText
            client={client}
            path={resolvedPath!}
            reloadKey={reloadKey}
            editable={editable}
            text={pathText}
            onTextChange={setPathText}
            onSave={onSavePathScript}
            saving={saving}
            saveError={saveError}
          />
        ) : null}
        {!hasInline && !hasPath ? (
          <p className="text-[12px] text-on-surface-variant">This transform step has no script yet.</p>
        ) : null}
      </div>
    )
  }

  if (code === "expression") {
    return (
      <div className="space-y-2">
        <p className="font-mono text-label uppercase text-on-surface-variant">Expression</p>
        {editable ? (
          <>
            <textarea
              data-testid="node-transform-expression"
              className="min-h-[120px] w-full rounded border border-outline-variant bg-surface-container-lowest p-2 font-mono text-[11px] text-on-surface"
              value={expressionText}
              onChange={(event) => setExpressionText(event.target.value)}
              disabled={saving}
            />
            <button
              type="button"
              data-testid="node-transform-expression-save"
              className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 font-mono text-[11px] text-on-primary disabled:opacity-50"
              disabled={saving || expressionText === (step.expression ?? "")}
              onClick={onSaveExpression}
            >
              <Save className="h-3 w-3" aria-hidden="true" />
              Save expression
            </button>
          </>
        ) : (
          <pre className="max-h-72 overflow-auto rounded bg-surface-container-lowest p-2 font-mono text-[11px] text-on-surface">
            {step.expression ?? ""}
          </pre>
        )}
      </div>
    )
  }

  return null
}

/**
 * Details of the selected node: capability, bindings (with script text), `expr`, config,
 * validation issues and the capability's `accepts` / `returns` schemas.
 * @category App
 */
export function NodePanel({
  client,
  source,
  storedVersion,
  draft,
  onDraftChange,
  manifest,
  executionPath,
  node,
  capability,
  issues,
  runStep,
  runLoopItems,
  runLoop,
  reloadKey,
  onUnauthorized,
}: NodePanelProps) {
  const stepContractSchemas = useMemo(() => {
    if (!node || node.type === "ecp-io" || !manifest) return undefined
    const step = findStep(manifest, node.id)
    if (!step?.accepts && !step?.returns) return undefined
    return { accepts: step.accepts, returns: step.returns }
  }, [manifest, node])

  if (!node) {
    return (
      <section data-testid="node-panel" className="space-y-2 text-[12px] text-on-surface-variant">
        <p>Select a node on the graph to inspect its capability, inputs and schemas.</p>
      </section>
    )
  }
  if (node.type === "ecp-io") return <IoPanel node={node} manifest={manifest} />
  if (node.type === "ecp-loop") {
    return (
      <LoopItemsPanel
        node={node}
        data={node.data as ReactFlowLoopItemsData}
        manifest={manifest}
        issues={issues}
        loopRun={runLoopItems}
        loopRound={runLoop}
      />
    )
  }
  const data = node.data as ReactFlowStepData
  const step = findStep(manifest, node.id)
  return (
    <section data-testid="node-panel" data-node-id={node.id} className="space-y-4">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-on-surface">
          <Box className="h-4 w-4 text-primary" aria-hidden="true" />
          {data.label}
        </h3>
        {capability?.summary ? <p className="text-[12px] text-on-surface-variant">{capability.summary}</p> : null}
      </header>
      <div className="space-y-1.5">
        <Row label="Id">{node.id}</Row>
        <Row label="Uses">{data.uses}</Row>
        {data.config ? <Row label="Config">{data.config}</Row> : null}
        {data.as ? (
          <Row label="As">
            {data.as}
            {data.mode ? ` (${data.mode})` : ""}
          </Row>
        ) : null}
        {step?.expr ? <Row label="Expr">{step.expr}</Row> : null}
        {runStep ? (
          <Row label="Status">
            <span data-testid="node-run-status">{runStep.status}</span>
            {runStep.round !== undefined ? ` (round ${runStep.round})` : ""}
          </Row>
        ) : null}
      </div>
      {capability?.description ? (
        <p className="whitespace-pre-wrap text-[12px] text-on-surface-variant">{capability.description}</p>
      ) : null}
      {step && manifest && capability?.contract === "step" ? (
        <TransformCodePanel
          client={client}
          source={source}
          storedVersion={storedVersion}
          manifest={manifest}
          draft={draft}
          onDraftChange={onDraftChange}
          step={step}
          capability={capability}
          reloadKey={reloadKey}
          executionPath={executionPath}
          onUnauthorized={onUnauthorized}
        />
      ) : null}
      {issues.length > 0 ? (
        <ul className="space-y-2">
          {issues.map((issue, index) => (
            <li key={`${issue.code}-${index}`} className="flex gap-2 rounded border border-error/40 p-2 text-[12px]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-error" aria-hidden="true" />
              <span>
                <span className="font-mono text-error">{issue.code}</span> {issue.message}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="space-y-2">
        <p className="font-mono text-label uppercase text-on-surface-variant">Inputs</p>
        {data.inputs.length > 0 ? (
          <ul className="space-y-3">
            {data.inputs.map((port) => (
              <InputBinding
                key={port.id}
                port={port}
                client={client}
                executionPath={executionPath}
                reloadKey={reloadKey}
              />
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-on-surface-variant">This step takes no input.</p>
        )}
      </div>
      {stepContractSchemas ? (
        <div className="space-y-2">
          {stepContractSchemas.accepts ? (
            <JsonBlock title="step accepts" value={stepContractSchemas.accepts} testId="node-step-accepts" />
          ) : null}
          {stepContractSchemas.returns ? (
            <JsonBlock title="step returns" value={stepContractSchemas.returns} testId="node-step-returns" />
          ) : null}
        </div>
      ) : capability ? (
        <div className="space-y-2">
          <JsonBlock title="accepts" value={capability.accepts} testId="node-accepts" />
          <JsonBlock title="returns" value={capability.returns} testId="node-returns" />
        </div>
      ) : (
        <p className="text-[11px] text-outline">Capability {data.uses} is not installed on this host.</p>
      )}
    </section>
  )
}