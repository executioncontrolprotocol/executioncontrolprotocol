import { useCallback, useState, type ReactNode } from "react"
import { AlertTriangle } from "lucide-react"
import type { ExecutionManifest, JsonValue, ValidationIssue } from "@executioncontrolprotocol/protocol"
import {
  parseLiteralInput,
  parseSchemaText,
  type ConditionForm,
  type InputBindingEdit,
  type StructureEditResult,
} from "../../graph/index.js"
import type { EditorApplyRequest } from "../hooks/useExecutionEditor.js"

/** Tailwind classes shared by the panel text inputs. */
const FIELD_CLASS =
  "w-full rounded border border-outline-variant bg-surface-container-lowest px-2 py-1 font-mono text-[11px] disabled:opacity-60"

/** Tailwind classes shared by the panel field captions. */
const CAPTION_CLASS = "font-mono text-label uppercase text-on-surface-variant"

/**
 * Editing surface a node panel gets from the workspace: structural edits (one saved edit each) and debounced text
 * edits (autosave), both undoable.
 * @category App
 */
export interface PanelEditContext {
  /** Open execution manifest (includes unsaved draft). */
  manifest?: ExecutionManifest
  /** Live run or replay disables every field. */
  readOnly: boolean
  /** Changes on reload, undo and redo so uncontrolled fields show the new value. */
  fieldEpoch: number
  /** Persist one structural edit. */
  applyManifestEdit?: (edit: (manifest: ExecutionManifest) => StructureEditResult) => Promise<boolean>
  /** Queue a debounced text edit. */
  scheduleTextEdit?: (request: EditorApplyRequest) => void
  /** Save the queued text edit now. */
  flushTextEdit?: () => void
}

/**
 * Edit helpers bound to one panel: `choose` applies a discrete change at once, `type` queues a text change and `commit`
 * queues and saves it (blur or Enter). A refused edit shows its reason in `error` and changes nothing.
 * @category App
 */
export interface PanelEditor {
  /** True when the fields can't be edited. */
  disabled: boolean
  /** Reason the last edit was refused. */
  error: string | undefined
  /** Show a refusal reason (or clear it). */
  setError: (reason: string | undefined) => void
  /** Apply a discrete change (select, toggle, button) as one saved edit. */
  choose: (label: string, apply: (manifest: ExecutionManifest) => StructureEditResult) => void
  /** Queue a text change for the debounced autosave. */
  type: (label: string, apply: (manifest: ExecutionManifest) => StructureEditResult) => void
  /** Queue a text change and save it now. */
  commit: (label: string, apply: (manifest: ExecutionManifest) => StructureEditResult) => void
}

/**
 * Bind {@link PanelEditContext} to refusal reporting and the save paths.
 * @category App
 */
export function usePanelEditor(context: PanelEditContext): PanelEditor {
  const { manifest, readOnly, applyManifestEdit, scheduleTextEdit, flushTextEdit } = context
  const [error, setError] = useState<string | undefined>(undefined)
  const disabled = readOnly || !applyManifestEdit || !manifest

  const preview = useCallback(
    (apply: (current: ExecutionManifest) => StructureEditResult): boolean => {
      if (!manifest) return false
      const result = apply(manifest)
      if (!result.ok) {
        setError(result.reason)
        return false
      }
      setError(undefined)
      return true
    },
    [manifest],
  )

  const choose = useCallback<PanelEditor["choose"]>(
    (_label, apply) => {
      if (disabled || !preview(apply)) return
      flushTextEdit?.()
      void applyManifestEdit?.(apply)
    },
    [applyManifestEdit, disabled, flushTextEdit, preview],
  )

  const type = useCallback<PanelEditor["type"]>(
    (label, apply) => {
      if (disabled || !preview(apply)) return
      if (scheduleTextEdit) scheduleTextEdit({ label, apply })
    },
    [disabled, preview, scheduleTextEdit],
  )

  const commit = useCallback<PanelEditor["commit"]>(
    (label, apply) => {
      if (disabled || !preview(apply)) return
      if (scheduleTextEdit) {
        scheduleTextEdit({ label, apply })
        flushTextEdit?.()
      } else void applyManifestEdit?.(apply)
    },
    [applyManifestEdit, disabled, flushTextEdit, preview, scheduleTextEdit],
  )

  return { disabled, error, setError, choose, type, commit }
}

/**
 * Captioned panel field.
 * @category App
 */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className={CAPTION_CLASS}>{label}</span>
      {children}
    </label>
  )
}

/**
 * Single-line text field that saves on blur and Enter and autosaves while typing.
 * @category App
 */
export function TextField({
  label,
  testId,
  value,
  editor,
  placeholder,
  type: inputType = "text",
  onType,
  onCommit,
}: {
  label: string
  testId: string
  value: string
  editor: PanelEditor
  placeholder?: string
  type?: "text" | "number"
  onType?: (text: string) => void
  onCommit: (text: string) => void
}) {
  return (
    <Field label={label}>
      <input
        data-testid={testId}
        type={inputType}
        className={FIELD_CLASS}
        defaultValue={value}
        placeholder={placeholder}
        disabled={editor.disabled}
        onChange={(event) => onType?.(event.target.value)}
        onBlur={(event) => onCommit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onCommit((event.target as HTMLInputElement).value)
        }}
      />
    </Field>
  )
}

/**
 * Choice field that saves at once.
 * @category App
 */
export function SelectField({
  label,
  testId,
  value,
  options,
  editor,
  onChoose,
}: {
  label: string
  testId: string
  value: string
  options: readonly string[]
  editor: PanelEditor
  onChoose: (value: string) => void
}) {
  return (
    <Field label={label}>
      <select
        data-testid={testId}
        className={FIELD_CLASS}
        value={value}
        disabled={editor.disabled}
        onChange={(event) => onChoose(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </Field>
  )
}

/**
 * JSON schema text editor (as for transform steps): empty removes the schema, anything else must be a JSON object.
 * @category App
 */
export function SchemaField({
  label,
  testId,
  schema,
  editor,
  onChange,
}: {
  label: string
  testId: string
  schema: Record<string, unknown> | undefined
  editor: PanelEditor
  /** Build the edit for the parsed schema (`undefined` removes it). */
  onChange: (schema: Record<string, unknown> | undefined) => (manifest: ExecutionManifest) => StructureEditResult
}) {
  const initial = schema === undefined ? "" : JSON.stringify(schema, null, 2)
  const handle = (text: string, save: boolean): void => {
    const parsed = parseSchemaText(text)
    if (!parsed.ok) {
      editor.setError(parsed.reason)
      return
    }
    const apply = onChange(parsed.schema)
    if (save) editor.commit(`${label} schema`, apply)
    else editor.type(`${label} schema`, apply)
  }
  return (
    <Field label={label}>
      <textarea
        data-testid={testId}
        className={`${FIELD_CLASS} min-h-[96px]`}
        defaultValue={initial}
        spellCheck={false}
        disabled={editor.disabled}
        onChange={(event) => handle(event.target.value, false)}
        onBlur={(event) => handle(event.target.value, true)}
      />
    </Field>
  )
}

type BindingMode = "unset" | "literal" | "ref"

interface BindingView {
  mode: BindingMode | "script"
  text: string
}

function literalText(value: JsonValue): string {
  if (typeof value === "string") {
    try {
      JSON.parse(value)
      return JSON.stringify(value)
    } catch {
      return value
    }
  }
  return JSON.stringify(value)
}

/** How an `input` entry reads in the panel: unset, a `$ref` branch, a `$script` marker, or a literal. */
function viewOfBinding(value: unknown): BindingView {
  if (value === undefined) return { mode: "unset", text: "" }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const marker = value as Record<string, unknown>
    if (typeof marker.$ref === "string") return { mode: "ref", text: marker.$ref }
    if (Array.isArray(marker.$ref)) return { mode: "ref", text: marker.$ref.join(", ") }
    if ("$script" in marker) return { mode: "script", text: "" }
  }
  return { mode: "literal", text: literalText(value as JsonValue) }
}

function BindingRow({
  name,
  typeLabel,
  value,
  testId,
  editor,
  onBind,
}: {
  name: string
  typeLabel?: string
  value: unknown
  testId: string
  editor: PanelEditor
  onBind: (binding: InputBindingEdit) => void
}) {
  const view = viewOfBinding(value)
  const [mode, setMode] = useState<BindingMode | "script">(view.mode)
  const scripted = view.mode === "script"
  const bind = (nextMode: BindingMode, text: string): void => {
    if (nextMode === "unset") onBind({ kind: "unset" })
    else if (nextMode === "ref") onBind({ kind: "ref", path: text })
    else onBind({ kind: "literal", value: parseLiteralInput(text) })
  }
  return (
    <li data-testid={`${testId}-row`} data-name={name} data-binding={view.mode} className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 font-mono text-[12px]">
        <span className="text-on-surface">
          {name}
          {typeLabel ? <span className="text-outline">:{typeLabel}</span> : null}
        </span>
        <select
          data-testid={`${testId}-mode`}
          aria-label={`${name} binding`}
          className="rounded bg-surface-container-high px-1.5 py-0.5 text-[10px] uppercase text-on-surface-variant"
          value={mode}
          disabled={editor.disabled || scripted}
          onChange={(event) => {
            const next = event.target.value as BindingMode
            setMode(next)
            if (next === "unset") bind("unset", "")
            else if (view.text !== "" && view.mode !== "unset") bind(next, view.text)
          }}
        >
          {scripted ? <option value="script">script</option> : null}
          <option value="unset">unset</option>
          <option value="literal">literal</option>
          <option value="ref">bound</option>
        </select>
      </div>
      {mode === "literal" || mode === "ref" ? (
        <input
          data-testid={`${testId}-value`}
          aria-label={`${name} value`}
          className={FIELD_CLASS}
          defaultValue={view.text}
          placeholder={mode === "ref" ? "state.name" : "value"}
          disabled={editor.disabled}
          onBlur={(event) => bind(mode, event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") bind(mode, (event.target as HTMLInputElement).value)
          }}
        />
      ) : null}
      {scripted ? <p className="text-[11px] text-on-surface-variant">Bound to a script; edit it in the JSON.</p> : null}
    </li>
  )
}

/**
 * Input bindings of a node: each key is unset, a literal, or bound (`$ref`) to a state value. Keys come from the
 * node's declared input ports and anything already in `input`; a new key can be added by name.
 * @category App
 */
export function BindingList({
  title,
  testId,
  ports,
  input,
  editor,
  onBind,
  fixedKeys = false,
}: {
  title: string
  testId: string
  ports: ReadonlyArray<{ name: string; typeLabel?: string }>
  input: Record<string, unknown> | undefined
  editor: PanelEditor
  /** Build the edit for one input key. */
  onBind: (key: string, binding: InputBindingEdit) => (manifest: ExecutionManifest) => StructureEditResult
  /** Only the declared ports (no extra keys, no "Add input"), as for a loop driver. */
  fixedKeys?: boolean
}) {
  const keys = fixedKeys
    ? ports.map((port) => port.name)
    : [...new Set([...ports.map((port) => port.name), ...Object.keys(input ?? {})])]
  const labels = new Map(ports.map((port) => [port.name, port.typeLabel]))
  const [draftKey, setDraftKey] = useState("")
  return (
    <div data-testid={testId} className="space-y-2">
      <p className={CAPTION_CLASS}>{title}</p>
      {keys.length > 0 ? (
        <ul className="space-y-3">
          {keys.map((key) => (
            <BindingRow
              key={`${key}-${JSON.stringify(input?.[key] ?? null)}`}
              name={key}
              typeLabel={labels.get(key)}
              value={input?.[key]}
              testId={`${testId}-${key}`}
              editor={editor}
              onBind={(binding) => editor.choose(`Input ${key}`, onBind(key, binding))}
            />
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-on-surface-variant">No inputs yet.</p>
      )}
      {fixedKeys ? null : (
      <div className="flex gap-2">
        <input
          data-testid={`${testId}-new-key`}
          aria-label="New input name"
          className={FIELD_CLASS}
          placeholder="new input name"
          value={draftKey}
          disabled={editor.disabled}
          onChange={(event) => setDraftKey(event.target.value)}
        />
        <button
          type="button"
          data-testid={`${testId}-add`}
          disabled={editor.disabled || draftKey.trim() === ""}
          className="rounded border border-outline-variant px-2 py-1 text-[11px] enabled:hover:bg-surface-container-highest disabled:opacity-50"
          onClick={() => {
            const key = draftKey.trim()
            setDraftKey("")
            editor.choose(`Input ${key}`, onBind(key, { kind: "literal", value: "" }))
          }}
        >
          Add input
        </button>
      </div>
      )}
    </div>
  )
}

/**
 * Condition or gather editor: a toggle between forms (`expression`, `script`, and `none` for an `end`) and the text of
 * the current form. A script kept in a file is shown read-only.
 * @category App
 */
export function ConditionField({
  title,
  testId,
  forms,
  form,
  text,
  scriptPath,
  editor,
  onForm,
  onText,
}: {
  title: string
  testId: string
  forms: readonly ConditionForm[]
  form: ConditionForm
  text: string
  /** Path of a script kept in a file, when the script is not inline. */
  scriptPath?: string
  editor: PanelEditor
  /** Build the edit that switches form. */
  onForm: (form: ConditionForm) => (manifest: ExecutionManifest) => StructureEditResult
  /** Build the edit that sets the text of the current form. */
  onText: (text: string) => (manifest: ExecutionManifest) => StructureEditResult
}) {
  return (
    <div data-testid={testId} data-form={form} className="space-y-2">
      <p className={CAPTION_CLASS}>{title}</p>
      <div role="radiogroup" aria-label={`${title} form`} className="flex gap-1">
        {forms.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={form === option}
            data-testid={`${testId}-form-${option}`}
            disabled={editor.disabled}
            className={`rounded border px-2 py-1 text-[11px] disabled:opacity-60 ${
              form === option
                ? "border-primary bg-surface-container-highest text-on-surface"
                : "border-outline-variant text-on-surface-variant enabled:hover:bg-surface-container-highest"
            }`}
            onClick={() => {
              if (form !== option) editor.choose(`${title} form`, onForm(option))
            }}
          >
            {option}
          </button>
        ))}
      </div>
      {form === "none" ? (
        <p className="text-[12px] text-on-surface-variant">The result is the value input.</p>
      ) : scriptPath !== undefined ? (
        <p data-testid={`${testId}-file`} className="break-all font-mono text-[11px] text-on-surface-variant">
          Script file {scriptPath}
        </p>
      ) : (
        <textarea
          data-testid={`${testId}-text`}
          aria-label={`${title} ${form}`}
          className={`${FIELD_CLASS} min-h-[80px]`}
          defaultValue={text}
          spellCheck={false}
          disabled={editor.disabled}
          onChange={(event) => editor.type(title, onText(event.target.value))}
          onBlur={(event) => editor.commit(title, onText(event.target.value))}
        />
      )}
    </div>
  )
}

/**
 * Inline refusal reason of the last panel edit.
 * @category App
 */
export function EditError({ editor, testId = "panel-edit-error" }: { editor: PanelEditor; testId?: string }) {
  if (!editor.error) return null
  return (
    <p className="text-[11px] text-error" data-testid={testId}>
      {editor.error}
    </p>
  )
}

/**
 * Validation issues on the selected node.
 * @category App
 */
export function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null
  return (
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
  )
}
