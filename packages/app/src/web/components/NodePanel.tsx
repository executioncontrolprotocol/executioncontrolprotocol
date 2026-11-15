import { useEffect, useState, type ReactNode } from "react"
import { AlertTriangle, Box, FileCode2 } from "lucide-react"
import type { CapabilityEntry, ExecutionManifest, StepNode, ValidationIssue } from "@executioncontrolprotocol/protocol"
import { resolveScriptPath, UnauthorizedError, type AppHostClient } from "../../client/index.js"
import {
  collectSteps,
  type ReactFlowIoData,
  type ReactFlowNode,
  type ReactFlowPort,
  type ReactFlowStepData,
  type RunGraphStep,
} from "../../graph/index.js"

/**
 * Props for {@link NodePanel}.
 * @category App
 */
export interface NodePanelProps {
  /** Host client, for `$script.path` text. */
  client: AppHostClient
  /** Open execution manifest. */
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
  /** Changes on every reload, so script text is fetched again. */
  reloadKey: number
}

function findStep(manifest: ExecutionManifest | undefined, id: string): StepNode | undefined {
  if (!manifest || !Array.isArray(manifest.steps)) return undefined
  const steps: StepNode[] = []
  collectSteps(manifest.steps, steps)
  return steps.find((step) => step.id === id)
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

function ScriptText({ client, path, reloadKey }: { client: AppHostClient; path: string; reloadKey: number }) {
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
    <pre data-testid="node-script" className="max-h-72 overflow-auto rounded bg-surface-container-lowest p-2 font-mono text-[11px] text-on-surface">
      {text ?? "Loading…"}
    </pre>
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
        <pre data-testid="node-script" className="max-h-72 overflow-auto rounded bg-surface-container-lowest p-2 font-mono text-[11px] text-on-surface">
          {port.scriptSource}
        </pre>
      ) : null}
      {scriptPath ? (
        <div className="space-y-1">
          <p className="flex items-center gap-1 font-mono text-[10px] text-on-surface-variant">
            <FileCode2 className="h-3 w-3" aria-hidden="true" />
            {scriptPath}
          </p>
          <ScriptText client={client} path={scriptPath} reloadKey={reloadKey} />
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

/**
 * Details of the selected node: capability, bindings (with script text), `expr`, config,
 * validation issues and the capability's `accepts` / `returns` schemas.
 * @category App
 */
export function NodePanel({
  client,
  manifest,
  executionPath,
  node,
  capability,
  issues,
  runStep,
  reloadKey,
}: NodePanelProps) {
  if (!node) {
    return (
      <section data-testid="node-panel" className="space-y-2 text-[12px] text-on-surface-variant">
        <p>Select a node on the graph to inspect its capability, inputs and schemas.</p>
      </section>
    )
  }
  if (node.type === "ecp-io") return <IoPanel node={node} manifest={manifest} />
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
      {capability ? (
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
