import type { NodeProps } from "@xyflow/react"
import { AlertTriangle, Filter } from "lucide-react"
import type { ReactFlowStepData, ReactFlowStepStatus } from "../../graph/index.js"
import { InputPortRow, OutputPortRow } from "./ports.js"

/**
 * Data for {@link EcpStepNode}: the encoded step plus run and validation overlays.
 * @category App
 */
export interface EcpStepNodeData extends ReactFlowStepData {
  /** Run status, when a run is shown. */
  status?: ReactFlowStepStatus
  /** Loop round of the status, when inside a loop. */
  round?: number
  /** Failure message, or the first validation issue message. */
  errorMessage?: string
  /** True when validation reported an error on this node. */
  invalid?: boolean
  /** Input port ids with an incoming data edge. */
  connectedTargetHandles?: string[]
  /** Output port ids with an outgoing data edge. */
  connectedSourceHandles?: string[]
}

/**
 * View-only React Flow node for a capability step: label, capability id, `as`, `expr`
 * gate, ports with their bindings, and run / validation status.
 * @category App
 */
export function EcpStepNode({ id, data, selected }: NodeProps) {
  const step = data as unknown as EcpStepNodeData
  const targets = new Set(step.connectedTargetHandles ?? [])
  const sources = new Set(step.connectedSourceHandles ?? [])
  const classes = [
    "ecp-rf-node min-w-[200px] rounded-lg border border-outline-variant bg-surface-container px-3 py-2 shadow-sm",
    step.status && step.status !== "idle" ? `ecp-rf-node--${step.status}` : "",
    step.invalid ? "ecp-rf-node--invalid" : "",
    selected ? "ecp-rf-node--selected" : "",
  ]
  const showError = Boolean(step.errorMessage) && (step.invalid || step.status === "failed")

  return (
    <div
      data-testid={`ecp-step-${id}`}
      data-status={step.status ?? "idle"}
      data-selected={selected ? "true" : "false"}
      data-invalid={step.invalid ? "true" : "false"}
      className={classes.join(" ")}
    >
      <div className="mb-2 flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-display text-[11px] font-semibold leading-tight text-on-surface">{step.label}</div>
          <div className="mt-1 break-all font-mono text-[10px] leading-snug text-on-surface-variant" title={step.uses}>
            {step.uses}
          </div>
          {step.as ? (
            <div className="mt-1 font-mono text-[10px] text-primary-fixed">
              as {step.as}
              {step.mode ? ` (${step.mode})` : ""}
            </div>
          ) : null}
          {step.exprBadge ? (
            <div
              className="mt-1 inline-flex max-w-full items-center gap-1 truncate rounded border border-outline-variant bg-surface-container-high px-1.5 py-0.5 font-mono text-[9px] text-tertiary-fixed-dim"
              title={step.exprBadge}
            >
              <Filter className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
              {step.exprBadge}
            </div>
          ) : null}
          {step.round !== undefined ? (
            <div className="mt-1 font-mono text-[9px] text-on-surface-variant">round {step.round}</div>
          ) : null}
        </div>
        {showError ? (
          <span data-testid="ecp-step-error" title={step.errorMessage}>
            <AlertTriangle className="h-4 w-4 text-error" aria-label={step.errorMessage} />
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        {step.inputs.map((port) => (
          <InputPortRow
            key={`in-${port.id}`}
            port={port}
            connected={port.binding === "ref" || targets.has(port.id)}
          />
        ))}
        {step.outputs.map((port) => (
          <OutputPortRow key={`out-${port.id}`} port={port} connected={sources.has(port.id)} />
        ))}
      </div>
    </div>
  )
}
