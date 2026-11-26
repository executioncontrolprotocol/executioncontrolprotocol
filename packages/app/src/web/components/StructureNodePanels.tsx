import type { ReactNode } from "react"
import { CornerDownLeft, GitBranch, Split } from "lucide-react"
import type {
  AddStepPlacement,
  ReactFlowEndData,
  ReactFlowIfData,
  ReactFlowNode,
  ReactFlowParallelData,
} from "../../graph/index.js"
import type { IfNode, Node, ParallelNode, ValidationIssue } from "@executioncontrolprotocol/protocol"
import {
  conditionForm,
  loopIdFromEndNodeId,
  setIfAccepts,
  setIfAs,
  setIfConditionForm,
  setIfConditionText,
  setIfInputBinding,
  setIfLabel,
  setParallelAccepts,
  setParallelAs,
  setParallelInputBinding,
  setParallelLabel,
  setParallelMaxConcurrency,
} from "../../graph/index.js"
import { locateNode } from "../../graph/manifest-walk.js"
import {
  BindingList,
  ConditionField,
  EditError,
  IssueList,
  SchemaField,
  TextField,
  usePanelEditor,
  type PanelEditContext,
} from "./panel-fields.js"

/**
 * Props shared by the `if`, `parallel` and `end` panels.
 * @category App
 */
export interface StructurePanelProps extends PanelEditContext {
  /** Selected graph node. */
  node: ReactFlowNode
  /** Validation issues on the selected node. */
  issues: ValidationIssue[]
  /** Open the capability picker for a new step (the parallel panel's "Add path"). */
  onOpenCapabilityMenu?: (clientX: number, clientY: number, placement: AddStepPlacement) => void
}

function PanelHeader({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <header className="space-y-1">
      <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-on-surface">
        {icon}
        {title}
      </h3>
      <p className="text-[12px] text-on-surface-variant">{subtitle}</p>
    </header>
  )
}

function KeyedValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2 text-[12px]">
      <span className="font-mono text-label uppercase text-on-surface-variant">{label}</span>
      <span className="min-w-0 break-all font-mono text-on-surface">{children}</span>
    </div>
  )
}

function nodeSummary(node: Node): string {
  const labelled = node as { id?: string; label?: string; type?: string }
  return labelled.label ?? labelled.id ?? labelled.type ?? "node"
}

/**
 * Panel for a selected `if`: label, `accepts`, input bindings, the condition as an expression or a script, and `as`.
 * @category App
 */
export function IfPanel(props: StructurePanelProps) {
  const { node, issues, manifest, fieldEpoch } = props
  const editor = usePanelEditor(props)
  const data = node.data as ReactFlowIfData
  const source = manifest ? (locateNode(manifest, node.id)?.node as IfNode | undefined) : undefined
  const form = conditionForm(source ?? {})
  const text = source?.script?.source ?? source?.expression ?? ""
  return (
    <section data-testid="node-panel" data-node-id={node.id} data-node-kind="if" className="space-y-4">
      <PanelHeader
        icon={<GitBranch className="h-4 w-4 text-primary" aria-hidden="true" />}
        title={data.label}
        subtitle="If: runs the then side when the condition is true, else the else side."
      />
      <div className="space-y-1.5">
        <KeyedValue label="Kind">if</KeyedValue>
        <KeyedValue label="Id">{node.id}</KeyedValue>
      </div>
      <div key={`${node.id}-${fieldEpoch}`} className="space-y-3 border-t border-outline-variant pt-3">
        <TextField
          label="Label"
          testId="if-field-label"
          value={source?.label ?? ""}
          editor={editor}
          onType={(next) => editor.type("If label", (current) => setIfLabel(current, node.id, next))}
          onCommit={(next) => editor.commit("If label", (current) => setIfLabel(current, node.id, next))}
        />
        <SchemaField
          label="Accepts"
          testId="if-field-accepts"
          schema={source?.accepts}
          editor={editor}
          onChange={(schema) => (current) => setIfAccepts(current, node.id, schema)}
        />
        <BindingList
          title="Inputs"
          testId="if-inputs"
          ports={data.inputs}
          input={source?.input}
          editor={editor}
          onBind={(key, binding) => (current) => setIfInputBinding(current, node.id, key, binding)}
        />
        <ConditionField
          key={form}
          title="Condition"
          testId="if-condition"
          forms={["expression", "script"]}
          form={form}
          text={text}
          scriptPath={source?.script?.path}
          editor={editor}
          onForm={(next) => (current) =>
            setIfConditionForm(current, node.id, next === "script" ? "script" : "expression")
          }
          onText={(next) => (current) => setIfConditionText(current, node.id, next)}
        />
        <TextField
          label="As"
          testId="if-field-as"
          value={source?.as ?? ""}
          editor={editor}
          placeholder="optional alias of the input"
          onCommit={(next) => editor.commit("If as", (current) => setIfAs(current, node.id, next))}
        />
        <EditError editor={editor} />
      </div>
      <IssueList issues={issues} />
    </section>
  )
}

/**
 * Panel for a selected `parallel`: label, optional `accepts` / `input` / `as`, `maxConcurrency`, and a read-only list of
 * paths with "Add path".
 * @category App
 */
export function ParallelPanel(props: StructurePanelProps) {
  const { node, issues, manifest, fieldEpoch, onOpenCapabilityMenu, readOnly } = props
  const editor = usePanelEditor(props)
  const data = node.data as ReactFlowParallelData
  const source = manifest ? (locateNode(manifest, node.id)?.node as ParallelNode | undefined) : undefined
  return (
    <section data-testid="node-panel" data-node-id={node.id} data-node-kind="parallel" className="space-y-4">
      <PanelHeader
        icon={<Split className="h-4 w-4 text-primary" aria-hidden="true" />}
        title={data.label}
        subtitle="Parallel: every path runs at the same time."
      />
      <div className="space-y-1.5">
        <KeyedValue label="Kind">parallel</KeyedValue>
        <KeyedValue label="Id">{node.id}</KeyedValue>
      </div>
      <div key={`${node.id}-${fieldEpoch}`} className="space-y-3 border-t border-outline-variant pt-3">
        <TextField
          label="Label"
          testId="parallel-field-label"
          value={source?.label ?? ""}
          editor={editor}
          onType={(next) => editor.type("Parallel label", (current) => setParallelLabel(current, node.id, next))}
          onCommit={(next) => editor.commit("Parallel label", (current) => setParallelLabel(current, node.id, next))}
        />
        <SchemaField
          label="Accepts"
          testId="parallel-field-accepts"
          schema={source?.accepts}
          editor={editor}
          onChange={(schema) => (current) => setParallelAccepts(current, node.id, schema)}
        />
        <BindingList
          title="Inputs"
          testId="parallel-inputs"
          ports={data.inputs}
          input={source?.input}
          editor={editor}
          onBind={(key, binding) => (current) => setParallelInputBinding(current, node.id, key, binding)}
        />
        <TextField
          label="As"
          testId="parallel-field-as"
          value={source?.as ?? ""}
          editor={editor}
          placeholder="optional alias of the input"
          onCommit={(next) => editor.commit("Parallel as", (current) => setParallelAs(current, node.id, next))}
        />
        <TextField
          label="Max concurrency"
          testId="parallel-field-max-concurrency"
          type="number"
          value={source?.maxConcurrency !== undefined ? String(source.maxConcurrency) : ""}
          editor={editor}
          placeholder="all paths at once"
          onCommit={(next) =>
            editor.commit("Parallel max concurrency", (current) =>
              setParallelMaxConcurrency(current, node.id, next.trim() === "" ? undefined : Number(next)),
            )
          }
        />
        <EditError editor={editor} />
      </div>
      <div className="space-y-2 border-t border-outline-variant pt-3">
        <p className="font-mono text-label uppercase text-on-surface-variant">Paths</p>
        <ol data-testid="parallel-paths" className="space-y-1">
          {(source?.paths ?? []).map((path, index) => (
            <li key={index} data-testid={`parallel-path-${index + 1}`} className="font-mono text-[11px] text-on-surface">
              Path {index + 1}: {path.map(nodeSummary).join(", ")}
            </li>
          ))}
        </ol>
        <button
          type="button"
          data-testid="parallel-add-path"
          disabled={readOnly || !onOpenCapabilityMenu}
          className="rounded border border-outline-variant px-2 py-1 text-[11px] enabled:hover:bg-surface-container-highest disabled:opacity-50"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            onOpenCapabilityMenu?.(rect.left, rect.bottom, { kind: "new-path", parallelId: node.id })
          }}
        >
          Add path
        </button>
      </div>
      <IssueList issues={issues} />
    </section>
  )
}

/**
 * Panel for a selected control node `end` (drawn only; nothing is stored on the loop).
 * @category App
 */
export function EndPanel(props: StructurePanelProps) {
  const { node, issues } = props
  const data = node.data as ReactFlowEndData
  const loopId = loopIdFromEndNodeId(node.id) ?? data.loopId
  return (
    <section data-testid="node-panel" data-node-id={node.id} data-node-kind="end" className="space-y-4">
      <PanelHeader
        icon={<CornerDownLeft className="h-4 w-4 text-primary" aria-hidden="true" />}
        title="End"
        subtitle={`End of loop ${loopId}: tunnel closes here (edits in Phase 2).`}
      />
      <div className="space-y-1.5">
        <KeyedValue label="Kind">end</KeyedValue>
        <KeyedValue label="Loop">{loopId}</KeyedValue>
      </div>
      <IssueList issues={issues} />
    </section>
  )
}
