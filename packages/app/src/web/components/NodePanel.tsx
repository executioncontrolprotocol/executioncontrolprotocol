import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AlertTriangle, Box, FileCode2 } from "lucide-react"
import type {
  CapabilityEntry,
  ExecutionManifest,
  LoopNode,
  Node,
  ScriptDescriptor,
  StepNode,
  ValidationIssue,
} from "@executioncontrolprotocol/protocol"
import {
  resolveScriptPath,
  UnauthorizedError,
  type AppHostClient,
} from "../../client/index.js"
import { scriptTextFromRetrieve } from "../../client/document-state.js"
import {
  collectSteps,
  setLoopDriver,
  setLoopField,
  setLoopLabel,
  setLoopMode,
  type AddStepPlacement,
  type LoopMode,
  type ReactFlowIoData,
  type ReactFlowNode,
  type ReactFlowLoopItemsData,
  type ReactFlowPort,
  type ReactFlowStepData,
  type RunGraphLoop,
  type RunGraphLoopItems,
  type RunGraphStep,
  type StructureEditResult,
} from "../../graph/index.js"
import type { ExecutionSource } from "../hooks/useExecutionDocument.js"
import type { EditorApplyRequest } from "../hooks/useExecutionEditor.js"
import {
  BindingList,
  EditError,
  IssueList,
  SelectField,
  TextField,
  usePanelEditor,
} from "./panel-fields.js"
import { EndPanel, IfPanel, ParallelPanel } from "./StructureNodePanels.js"

/**
 * Props for {@link NodePanel}.
 * @category App
 */
export interface NodePanelProps {
  /** Host client, for `$script.path` text and saves. */
  client: AppHostClient
  /** How the execution was opened (path vs id). */
  source: ExecutionSource
  scheduleTextEdit?: (request: EditorApplyRequest) => void
  flushTextEdit?: () => void
  fieldEpoch?: number
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
  /** Run round when the selected node is a `for` loop. */
  runLoop?: RunGraphLoop
  /** Changes on every reload, so script text is fetched again. */
  reloadKey: number
  /** Switch the App to its unauthorised screen. */
  onUnauthorized: () => void
  /** Live run or replay disables structure edits. */
  readOnly?: boolean
  /** Persist loop and other manifest edits. */
  applyManifestEdit?: (edit: (manifest: ExecutionManifest) => StructureEditResult) => Promise<boolean>
  /** Open the capability picker for a new step (the parallel panel's "Add path"). */
  onOpenCapabilityMenu?: (clientX: number, clientY: number, placement: AddStepPlacement) => void
}

function findStep(manifest: ExecutionManifest | undefined, id: string): StepNode | undefined {
  if (!manifest || !Array.isArray(manifest.steps)) return undefined
  const steps: StepNode[] = []
  collectSteps(manifest.steps, steps)
  return steps.find((step) => step.id === id)
}

function findLoop(manifest: ExecutionManifest | undefined, id: string): LoopNode | undefined {
  if (!manifest) return undefined
  const walk = (nodes: Node[]): LoopNode | undefined => {
    for (const node of nodes) {
      if (node.type === "loop" && node.id === id) return node
      if (node.type === "parallel") {
        for (const line of node.paths) {
          const hit = walk(line)
          if (hit) return hit
        }
      } else if (node.type === "if") {
        const hitThen = walk(node.then)
        if (hitThen) return hitThen
        if (node.else) {
          const hitElse = walk(node.else)
          if (hitElse) return hitElse
        }
      } else if (node.type === "loop") {
        const hit = walk(node.steps)
        if (hit) return hit
      }
    }
    return undefined
  }
  if (Array.isArray(manifest.steps)) {
    const hit = walk(manifest.steps)
    if (hit) return hit
  }
  if (Array.isArray(manifest.detached)) return walk(manifest.detached)
  return undefined
}

function patchStep(
  manifest: ExecutionManifest,
  stepId: string,
  patch: (step: StepNode) => StepNode,
): ExecutionManifest {
  const walk = (nodes: Node[]): Node[] =>
    nodes.map((node) => {
      if (node.type === "if") {
        return {
          ...node,
          then: walk(node.then),
          ...(node.else ? { else: walk(node.else) } : {}),
        }
      }
      if (node.type === "loop") return { ...node, steps: walk(node.steps) }
      if (node.type === "parallel") return { ...node, paths: node.paths.map((path) => walk(path)) }
      if ((node as StepNode).id === stepId) return patch(node as StepNode)
      return node
    })
  return { ...manifest, steps: walk(manifest.steps) }
}

type LoopFieldKey = "as" | "concurrency" | "onError"

const LOOP_MODES = ["forEach", "for"] as const

function LoopItemsPanel({
  node,
  data,
  manifest,
  issues,
  loopRun,
  loopRound,
  readOnly = false,
  applyManifestEdit,
  scheduleTextEdit,
  flushTextEdit,
  fieldEpoch = 0,
}: {
  node: ReactFlowNode
  data: ReactFlowLoopItemsData
  manifest?: ExecutionManifest
  issues: ValidationIssue[]
  loopRun?: RunGraphLoopItems
  loopRound?: RunGraphLoop
  readOnly: boolean
  applyManifestEdit?: (edit: (manifest: ExecutionManifest) => StructureEditResult) => Promise<boolean>
  scheduleTextEdit?: (request: EditorApplyRequest) => void
  flushTextEdit?: () => void
  fieldEpoch?: number
}) {
  const editor = usePanelEditor({ manifest, readOnly, fieldEpoch, applyManifestEdit, scheduleTextEdit, flushTextEdit })
  const source = findLoop(manifest, node.id)
  const mode = source?.mode ?? data.controlKind ?? "for"
  const driverKey = mode === "forEach" ? "items" : "count"
  const field = (name: LoopFieldKey, value: string | number) => (current: ExecutionManifest) =>
    setLoopField(current, node.id, name, value)

  return (
    <section data-testid="node-panel" data-node-id={node.id} data-node-kind="loop" className="space-y-4">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-on-surface">
          <Box className="h-4 w-4 text-primary" aria-hidden="true" />
          {data.label}
        </h3>
        <p className="text-[12px] text-on-surface-variant">Loop ({mode} mode).</p>
      </header>
      <div className="space-y-1.5">
        <Row label="Kind">loop</Row>
        <Row label="Id">{node.id}</Row>
        <Row label="Mode">{mode}</Row>
      </div>
      <div key={`${node.id}-${fieldEpoch}`} className="space-y-3 border-t border-outline-variant pt-3">
        <TextField
          label="Label"
          testId="loop-field-label"
          value={source?.label ?? ""}
          editor={editor}
          onType={(next) => editor.type("Loop label", (current) => setLoopLabel(current, node.id, next))}
          onCommit={(next) => editor.commit("Loop label", (current) => setLoopLabel(current, node.id, next))}
        />
        <SelectField
          label="Mode"
          testId="loop-field-mode"
          value={mode}
          options={LOOP_MODES}
          editor={editor}
          onChoose={(next) => editor.choose("Loop mode", (current) => setLoopMode(current, node.id, next as LoopMode))}
        />
        {driverKey ? (
          <BindingList
            key={driverKey}
            title={driverKey === "items" ? "Items" : "Count"}
            testId="loop-driver"
            ports={[{ name: driverKey, typeLabel: driverKey === "items" ? "array" : "integer" }]}
            input={source?.input}
            editor={editor}
            onBind={(_key, binding) => (current) => setLoopDriver(current, node.id, binding)}
            fixedKeys
          />
        ) : null}
        <TextField
          label="As"
          testId="loop-field-as"
          value={source?.as ?? data.as ?? ""}
          editor={editor}
          onType={(next) => editor.type("Loop as", field("as", next))}
          onCommit={(next) => editor.commit("Loop as", field("as", next))}
        />
        {mode === "forEach" ? (
          <>
            <TextField
              label="Concurrency"
              testId="loop-field-concurrency"
              type="number"
              value={String(source?.concurrency ?? data.concurrency ?? 1)}
              editor={editor}
              onType={(next) => editor.type("Loop concurrency", field("concurrency", Number.parseInt(next, 10)))}
              onCommit={(next) => editor.commit("Loop concurrency", field("concurrency", Number.parseInt(next, 10)))}
            />
            <SelectField
              label="On error"
              testId="loop-field-on-error"
              value={source?.onError ?? data.onError ?? "fail"}
              options={["fail", "continue"]}
              editor={editor}
              onChoose={(next) => editor.choose("Loop onError", field("onError", next))}
            />
          </>
        ) : null}
        <EditError editor={editor} testId="loop-field-error" />
      </div>
      <div className="space-y-1.5">
        {loopRun ? (
          <Row label="Progress">
            {loopRun.done} / {loopRun.count}
            {loopRun.failed > 0 ? ` (${loopRun.failed} failed)` : ""}
          </Row>
        ) : null}
        {loopRound ? <Row label="Round">{loopRound.round + 1}</Row> : null}
      </div>
      <IssueList issues={issues} />
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

function ReadOnlyFileBody({
  client,
  source,
  manifestKey,
  reloadKey,
}: {
  client: AppHostClient
  source: ExecutionSource
  manifestKey: string
  reloadKey: number
}) {
  const [text, setText] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  useEffect(() => {
    let alive = true
    setError(undefined)
    const input =
      source.kind === "path"
        ? { type: "execution" as const, path: source.path, include: ["scripts"] as Array<"scripts"> }
        : { type: "execution" as const, id: source.id, include: ["scripts"] as Array<"scripts"> }
    client
      .retrieve(input)
      .then((response) => {
        if (!alive) return
        const parsed = scriptTextFromRetrieve(response, manifestKey)
        if (!parsed.ok) setError(parsed.message)
        else setText(parsed.text)
      })
      .catch((caught: unknown) => {
        if (!alive || caught instanceof UnauthorizedError) return
        setError(caught instanceof Error ? caught.message : String(caught))
      })
    return () => {
      alive = false
    }
  }, [client, manifestKey, reloadKey, source])
  if (error) return <p className="text-[11px] text-error">{error}</p>
  return (
    <pre data-testid="node-input-script-file" className="max-h-72 overflow-auto rounded bg-surface-container-lowest p-2 font-mono text-[11px] text-on-surface">
      {text ?? "Loading…"}
    </pre>
  )
}

function ScriptText({
  client,
  source,
  manifestKey,
  reloadKey,
  editable,
  text,
  onTextChange,
  onBlur,
  onUnauthorized,
}: {
  client: AppHostClient
  source: ExecutionSource
  manifestKey: string
  reloadKey: number
  editable: boolean
  text: string
  onTextChange: (next: string) => void
  onBlur?: () => void
  onUnauthorized: () => void
}) {
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const [loaded, setLoaded] = useState(false)
  const onTextChangeRef = useRef(onTextChange)
  onTextChangeRef.current = onTextChange
  useEffect(() => {
    let alive = true
    setLoadError(undefined)
    setLoaded(false)
    const input =
      source.kind === "path"
        ? { type: "execution" as const, path: source.path, include: ["scripts"] as Array<"scripts"> }
        : { type: "execution" as const, id: source.id, include: ["scripts"] as Array<"scripts"> }
    client
      .retrieve(input)
      .then((response) => {
        if (!alive) return
        const parsed = scriptTextFromRetrieve(response, manifestKey)
        if (!parsed.ok) setLoadError(parsed.message)
        else {
          setLoaded(true)
          onTextChangeRef.current(parsed.text)
        }
      })
      .catch((caught: unknown) => {
        if (!alive) return
        if (caught instanceof UnauthorizedError) onUnauthorized()
        else setLoadError(caught instanceof Error ? caught.message : String(caught))
      })
    return () => {
      alive = false
    }
  }, [client, manifestKey, onUnauthorized, reloadKey, source])
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
        onBlur={() => onBlur?.()}
        disabled={!loaded}
      />
    </div>
  )
}

function bindingSummary(port: ReactFlowPort): string {
  if (port.binding === "ref") return `ref ${port.refPath ?? ""}${port.refOptional ? " (optional)" : ""}`
  if (port.binding === "script") return port.scriptPath ? `script ${port.scriptPath}` : "script (inline)"
  if (port.binding === "literal") return port.valueTitle ?? port.valuePreview ?? "literal"
  return "not set"
}

function InputBinding({
  port,
  client,
  source,
  executionPath,
  reloadKey,
}: {
  port: ReactFlowPort
  client: AppHostClient
  source: ExecutionSource
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
          <ReadOnlyFileBody
            client={client}
            source={source}
            manifestKey={port.scriptPath ?? ""}
            reloadKey={reloadKey}
          />
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
  manifest: _manifest,
  step,
  capability,
  reloadKey,
  executionPath: _executionPath,
  onUnauthorized,
  readOnly = false,
  scheduleTextEdit,
  flushTextEdit,
}: {
  client: AppHostClient
  source: ExecutionSource
  manifest: ExecutionManifest
  step: StepNode
  capability?: CapabilityEntry
  reloadKey: number
  executionPath?: string
  onUnauthorized: () => void
  readOnly?: boolean
  scheduleTextEdit?: (request: EditorApplyRequest) => void
  flushTextEdit?: () => void
}) {
  const editable = !readOnly && scheduleTextEdit !== undefined
  const code = capability?.code
  const inlineScript = step.script?.source ?? ""
  const pathScript = step.script?.path
  const [pathText, setPathText] = useState("")
  const [sourceText, setSourceText] = useState(inlineScript)
  const [expressionText, setExpressionText] = useState(step.expression ?? "")

  useEffect(() => {
    setSourceText(step.script?.source ?? "")
    setExpressionText(step.expression ?? "")
  }, [step.id, reloadKey])

  const queueInlineScript = useCallback(
    (text: string) => {
      if (!scheduleTextEdit) return
      const script: ScriptDescriptor = { lang: "js", source: text }
      scheduleTextEdit({
        label: "Script",
        apply: (current) => {
          const next = patchStep(current, step.id, (node) => ({ ...node, script }))
          return { ok: true as const, manifest: next }
        },
      })
    },
    [scheduleTextEdit, step.id],
  )

  const queuePathScript = useCallback(
    (text: string) => {
      if (!scheduleTextEdit || !pathScript) return
      const body = text.endsWith("\n") ? text : `${text}\n`
      scheduleTextEdit({
        label: "Script file",
        apply: (current) => ({ ok: true as const, manifest: current }),
        scripts: { [pathScript]: body },
      })
    },
    [pathScript, scheduleTextEdit],
  )

  const queueExpression = useCallback(
    (text: string) => {
      if (!scheduleTextEdit) return
      scheduleTextEdit({
        label: "Transform expression",
        apply: (current) => ({
          ok: true as const,
          manifest: patchStep(current, step.id, (node) => ({ ...node, expression: text })),
        }),
      })
    },
    [scheduleTextEdit, step.id],
  )

  if (code === "script") {
    const hasInline = step.script?.source !== undefined
    const hasPath = Boolean(pathScript)
    return (
      <div className="space-y-3">
        <p className="font-mono text-label uppercase text-on-surface-variant">Transform script</p>
        {hasInline ? (
          editable ? (
            <textarea
              data-testid="node-transform-script"
              className="min-h-[120px] w-full rounded border border-outline-variant bg-surface-container-lowest p-2 font-mono text-[11px] text-on-surface"
              value={sourceText}
              onChange={(event) => {
                setSourceText(event.target.value)
                queueInlineScript(event.target.value)
              }}
              onBlur={() => {
                queueInlineScript(sourceText)
                flushTextEdit?.()
              }}
            />
          ) : (
            <pre className="max-h-72 overflow-auto rounded bg-surface-container-lowest p-2 font-mono text-[11px] text-on-surface">
              {inlineScript}
            </pre>
          )
        ) : null}
        {hasPath && pathScript ? (
          <ScriptText
            client={client}
            source={source}
            manifestKey={pathScript}
            reloadKey={reloadKey}
            editable={source.kind === "path" && editable}
            text={pathText}
            onTextChange={(next) => {
              setPathText(next)
              queuePathScript(next)
            }}
            onBlur={() => {
              queuePathScript(pathText)
              flushTextEdit?.()
            }}
            onUnauthorized={onUnauthorized}
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
          <textarea
            data-testid="node-transform-expression"
            className="min-h-[120px] w-full rounded border border-outline-variant bg-surface-container-lowest p-2 font-mono text-[11px] text-on-surface"
            value={expressionText}
            onChange={(event) => {
              setExpressionText(event.target.value)
              queueExpression(event.target.value)
            }}
            onBlur={() => {
              queueExpression(expressionText)
              flushTextEdit?.()
            }}
          />
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
 * Details of the selected node: capability, bindings (with script text), config,
 * validation issues and the capability's `accepts` / `returns` schemas.
 * @category App
 */
export function NodePanel({
  client,
  source,
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
  readOnly = false,
  applyManifestEdit,
  scheduleTextEdit,
  flushTextEdit,
  fieldEpoch = 0,
  onOpenCapabilityMenu,
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
  if (node.type === "ecp-if" || node.type === "ecp-parallel" || node.type === "ecp-end") {
    const Panel = node.type === "ecp-if" ? IfPanel : node.type === "ecp-parallel" ? ParallelPanel : EndPanel
    return (
      <Panel
        node={node}
        issues={issues}
        manifest={manifest}
        readOnly={readOnly}
        fieldEpoch={fieldEpoch}
        applyManifestEdit={applyManifestEdit}
        scheduleTextEdit={scheduleTextEdit}
        flushTextEdit={flushTextEdit}
        onOpenCapabilityMenu={onOpenCapabilityMenu}
      />
    )
  }
  if (node.type === "ecp-loop") {
    return (
      <LoopItemsPanel
        node={node}
        data={node.data as ReactFlowLoopItemsData}
        manifest={manifest}
        issues={issues}
        loopRun={runLoopItems}
        loopRound={runLoop}
        readOnly={readOnly}
        applyManifestEdit={applyManifestEdit}
        scheduleTextEdit={scheduleTextEdit}
        flushTextEdit={flushTextEdit}
        fieldEpoch={fieldEpoch}
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
          manifest={manifest}
          step={step}
          capability={capability}
          reloadKey={reloadKey}
          executionPath={executionPath}
          onUnauthorized={onUnauthorized}
          readOnly={readOnly}
          scheduleTextEdit={scheduleTextEdit}
          flushTextEdit={flushTextEdit}
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
                source={source}
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
