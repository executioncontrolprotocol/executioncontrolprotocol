import type { ReactNode } from "react"
import { Box, GitBranch } from "lucide-react"
import type { ExecutionManifest, IfNode, LoopNode, ParallelNode, ValidationIssue } from "@executioncontrolprotocol/protocol"
import type { AddStepPlacement, ReactFlowControlData, ReactFlowNode, StructureEditResult } from "../../graph/index.js"
import type { ControlPanelKind } from "../../graph/kind-switch.js"
import {
  conditionForm,
  deleteParallelLine,
  IF_DEFAULT_EXPRESSION,
  kindSwitchAvailability,
  setIfConditionForm,
  setIfConditionText,
  setIfInputBinding,
  setLoopDriver,
  setLoopField,
  setLoopMode,
  setParallelInputBinding,
  setParallelMaxConcurrency,
  appendEmptyParallelPath,
  setStructureLabel,
  switchControlKind,
  type InputBindingEdit,
  type LoopMode,
} from "../../graph/index.js"
import { locateNode } from "../../graph/manifest-walk.js"
import {
  BindingList,
  ConditionField,
  EditError,
  Field,
  IssueList,
  SelectField,
  TextField,
  usePanelEditor,
  type PanelEditContext,
} from "./panel-fields.js"
import { EMPTY_INPUT_PORT_ID } from "../../graph/types.js"

const KIND_LABELS: Record<ControlPanelKind, string> = {
  if: "if",
  forEach: "for each",
  for: "for",
  parallel: "parallel",
}

const KIND_OPTIONS: ControlPanelKind[] = ["if", "forEach", "for", "parallel"]

/**
 * Props for {@link ControlNodePanel}.
 * @category App
 */
export interface ControlNodePanelProps extends PanelEditContext {
  /** Selected graph node (`ecp-if`, `ecp-loop`, or `ecp-parallel`). */
  node: ReactFlowNode
  issues: ValidationIssue[]
  onOpenCapabilityMenu?: (clientX: number, clientY: number, placement: AddStepPlacement) => void
}

function KeyedValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2 text-[12px]">
      <span className="font-mono text-label uppercase text-on-surface-variant">{label}</span>
      <span className="min-w-0 break-all font-mono text-on-surface">{children}</span>
    </div>
  )
}

/**
 * Unified panel for `if`, `forEach` / `for` loops and `parallel`.
 * @category App
 */
export function ControlNodePanel({ node, issues, manifest, fieldEpoch, onOpenCapabilityMenu: _onOpenCapabilityMenu, ...ctx }: ControlNodePanelProps) {
  const editor = usePanelEditor({ manifest, fieldEpoch, ...ctx })
  const data = node.data as ReactFlowControlData
  const source = manifest ? locateNode(manifest, node.id)?.node : undefined
  const kind: ControlPanelKind =
    source?.type === "loop"
      ? source.mode === "for"
        ? "for"
        : "forEach"
      : source?.type === "parallel"
        ? "parallel"
        : "if"
  const availability = manifest ? kindSwitchAvailability(manifest, node.id) : []

  const chooseKind = (next: ControlPanelKind) => (current: ExecutionManifest) => {
    if (source?.type === "loop" && (next === "for" || next === "forEach")) {
      return setLoopMode(current, node.id, next as LoopMode)
    }
    return switchControlKind(current, node.id, next)
  }

  const ifSource = source?.type === "if" ? (source as IfNode) : undefined
  const parallelSource = source?.type === "parallel" ? (source as ParallelNode) : undefined
  const loopSource = source?.type === "loop" ? (source as LoopNode) : undefined
  const form = conditionForm(ifSource ?? {})
  const conditionText = ifSource?.script?.source ?? ifSource?.expression ?? IF_DEFAULT_EXPRESSION

  const bindInput = (key: string, binding: InputBindingEdit) => (current: ExecutionManifest) => {
    if (loopSource) return setLoopDriver(current, node.id, binding)
    if (ifSource) return setIfInputBinding(current, node.id, key, binding)
    if (parallelSource) return setParallelInputBinding(current, node.id, key, binding)
    return { ok: false, reason: "Unknown control node" } satisfies StructureEditResult
  }

  return (
    <section data-testid="node-panel" data-node-id={node.id} data-node-kind="control" className="space-y-4">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-on-surface">
          {kind === "parallel" || kind === "if" ? (
            <GitBranch className="h-4 w-4 text-primary" aria-hidden="true" />
          ) : (
            <Box className="h-4 w-4 text-primary" aria-hidden="true" />
          )}
          {data.label}
        </h3>
        <p className="text-[12px] text-on-surface-variant">Control node.</p>
      </header>
      <div className="space-y-1.5">
        <KeyedValue label="Id">{node.id}</KeyedValue>
      </div>
      <div key={`${node.id}-${fieldEpoch}`} className="space-y-3 border-t border-outline-variant pt-3">
        <Field label="Kind">
          <select
            data-testid="control-field-kind"
            className="w-full rounded border border-outline-variant bg-surface-container-lowest px-2 py-1.5 font-mono text-[12px] text-on-surface"
            value={kind}
            disabled={editor.disabled}
            onChange={(event) => {
              const next = event.target.value as ControlPanelKind
              void editor.choose("Control kind", chooseKind(next))
            }}
          >
            {KIND_OPTIONS.map((option) => {
              const row = availability.find((entry) => entry.kind === option)
              const disabled = row ? !row.enabled && option !== kind : false
              return (
                <option key={option} value={option} disabled={disabled} title={row?.reason}>
                  {KIND_LABELS[option]}
                </option>
              )
            })}
          </select>
          {availability
            .filter((entry) => !entry.enabled && entry.kind !== kind && entry.reason)
            .map((entry) => (
              <p
                key={entry.kind}
                data-testid={`control-kind-unavailable-${entry.kind}`}
                className="mt-1 text-[11px] text-on-surface-variant"
              >
                {KIND_LABELS[entry.kind as ControlPanelKind]}: {entry.reason}
              </p>
            ))}
        </Field>
        <TextField
          label="Label"
          testId="control-field-label"
          value={source?.label ?? ""}
          editor={editor}
          onType={(next) => editor.type("Control label", (current) => setStructureLabel(current, node.id, next))}
          onCommit={(next) => editor.commit("Control label", (current) => setStructureLabel(current, node.id, next))}
        />
        {(kind === "forEach" || kind === "for") && loopSource ? (
          <BindingList
            title={kind === "forEach" ? "Items" : "Count"}
            testId="control-loop-driver"
            ports={[{ name: kind === "forEach" ? "items" : "count", typeLabel: kind === "forEach" ? "array" : "integer" }]}
            input={loopSource.input}
            editor={editor}
            onBind={(_key, binding) => (current) => setLoopDriver(current, node.id, binding)}
            fixedKeys
          />
        ) : (
          <BindingList
            title="Inputs"
            testId="control-inputs"
            ports={data.inputs.filter((port) => port.id !== EMPTY_INPUT_PORT_ID)}
            input={source?.input}
            editor={editor}
            onBind={bindInput}
          />
        )}
        {kind === "if" ? (
          <ConditionField
            key={form}
            title="Condition"
            testId="control-condition"
            forms={["expression", "script"]}
            form={form}
            text={conditionText}
            scriptPath={ifSource?.script?.path}
            editor={editor}
            onForm={(next) => (current) =>
              setIfConditionForm(current, node.id, next === "script" ? "script" : "expression")
            }
            onText={(next) => (current) => setIfConditionText(current, node.id, next)}
          />
        ) : null}
        {kind === "forEach" ? (
          <>
            <TextField
              label="Concurrency"
              testId="control-field-concurrency"
              type="number"
              value={String(loopSource?.concurrency ?? data.concurrency ?? 1)}
              editor={editor}
              onCommit={(next) =>
                editor.commit("Loop concurrency", (current) =>
                  setLoopField(current, node.id, "concurrency", Number.parseInt(next, 10)),
                )
              }
            />
            <SelectField
              label="On error"
              testId="control-field-on-error"
              value={loopSource?.onError ?? data.onError ?? "fail"}
              options={["fail", "continue"]}
              editor={editor}
              onChoose={(next) =>
                editor.choose("Loop onError", (current) =>
                  setLoopField(current, node.id, "onError", next === "continue" ? "continue" : "fail"),
                )
              }
            />
          </>
        ) : null}
        {kind === "parallel" ? (
          <>
            <TextField
              label="Max concurrency"
              testId="control-field-max-concurrency"
              type="number"
              value={parallelSource?.maxConcurrency !== undefined ? String(parallelSource.maxConcurrency) : ""}
              editor={editor}
              placeholder="all paths at once"
              onCommit={(next) =>
                editor.commit("Parallel max concurrency", (current) =>
                  setParallelMaxConcurrency(current, node.id, next.trim() === "" ? undefined : Number(next)),
                )
              }
            />
            <div className="space-y-2">
              <p className="font-mono text-label uppercase text-on-surface-variant">Paths</p>
              <ol data-testid="control-parallel-paths" className="space-y-1">
                {(parallelSource?.paths ?? []).map((path, index) => (
                  <li key={index} className="flex items-center justify-between gap-2 font-mono text-[11px] text-on-surface">
                    <span>
                      Path {index + 1}: {path.length} node{path.length === 1 ? "" : "s"}
                    </span>
                    {(parallelSource?.paths.length ?? 0) > 2 ? (
                      <button
                        type="button"
                        data-testid={`control-remove-path-${index + 1}`}
                        className="rounded border border-outline-variant px-1.5 py-0.5 text-[10px] enabled:hover:bg-surface-container-highest disabled:opacity-50"
                        disabled={editor.disabled}
                        onClick={() =>
                          void editor.commit("Remove path", (current) => deleteParallelLine(current, node.id, index))
                        }
                      >
                        Remove
                      </button>
                    ) : null}
                  </li>
                ))}
              </ol>
              <button
                type="button"
                data-testid="control-add-path"
                disabled={editor.disabled}
                className="rounded border border-outline-variant px-2 py-1 text-[11px] enabled:hover:bg-surface-container-highest disabled:opacity-50"
                onClick={() => void editor.commit("Add path", (current) => appendEmptyParallelPath(current, node.id))}
              >
                Add path
              </button>
            </div>
          </>
        ) : null}
        <EditError editor={editor} />
      </div>
      <IssueList issues={issues} />
    </section>
  )
}