import { useEffect, useMemo, useState } from "react"
import { Play } from "lucide-react"
import {
  collectRunInput,
  enumOptionDraft,
  initialRunInputDraft,
  runInputFields,
  type RunInputField,
} from "../../form/run-input-fields.js"

/**
 * Props for {@link RunInputForm}.
 * @category App
 */
export interface RunInputFormProps {
  /** `execution.accepts` JSON Schema. */
  acceptsSchema?: Record<string, unknown>
  /** True while a run is in flight. */
  busy: boolean
  /** Disable the Run button (for example when no execution is loaded). */
  disabled?: boolean
  /** Start a run with the collected input. */
  onRun: (input: Record<string, unknown>) => void
}

const INPUT_CLASS =
  "w-full rounded border border-outline-variant bg-surface-container-lowest px-2 py-1 font-mono text-[12px] text-on-surface placeholder:text-outline focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"

function FieldControl({
  field,
  value,
  busy,
  onChange,
}: {
  field: RunInputField
  value: string
  busy: boolean
  onChange: (next: string) => void
}) {
  const id = `run-input-${field.name}`
  if (field.kind === "boolean") {
    return (
      <select id={id} className={INPUT_CLASS} value={value} disabled={busy} onChange={(e) => onChange(e.target.value)}>
        {field.required ? null : <option value="">(unset)</option>}
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    )
  }
  if (field.kind === "enum") {
    return (
      <select id={id} className={INPUT_CLASS} value={value} disabled={busy} onChange={(e) => onChange(e.target.value)}>
        <option value="">{field.required ? "Choose…" : "(unset)"}</option>
        {(field.enumValues ?? []).map((option) => {
          const draft = enumOptionDraft(option)
          return (
            <option key={draft} value={draft}>
              {typeof option === "string" ? option : draft}
            </option>
          )
        })}
      </select>
    )
  }
  if (field.kind === "json") {
    return (
      <textarea
        id={id}
        className={`${INPUT_CLASS} min-h-[72px]`}
        value={value}
        disabled={busy}
        spellCheck={false}
        placeholder={field.jsonType === "array" ? "[]" : "{}"}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }
  return (
    <input
      id={id}
      className={INPUT_CLASS}
      type={field.kind === "string" ? "text" : "number"}
      step={field.kind === "integer" ? 1 : "any"}
      value={value}
      disabled={busy}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/**
 * Run input form generated from `execution.accepts`, with a Run button.
 * @category App
 */
export function RunInputForm({ acceptsSchema, busy, disabled = false, onRun }: RunInputFormProps) {
  const fields = useMemo(() => runInputFields(acceptsSchema), [acceptsSchema])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setDrafts(Object.fromEntries(fields.map((field) => [field.name, initialRunInputDraft(field)])))
    setErrors({})
  }, [fields])

  const run = () => {
    const result = collectRunInput(fields, drafts)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    onRun(result.input)
  }

  return (
    <section data-testid="run-input-form" className="space-y-3">
      {fields.length > 0 ? (
        <p className="font-mono text-label uppercase text-on-surface-variant">Run input</p>
      ) : null}
      {fields.map((field) => (
        <div key={field.name} className="space-y-1">
          <label htmlFor={`run-input-${field.name}`} className="block font-mono text-label text-on-surface">
            {field.label}
            <span className="text-outline">:{field.kind}</span>
            {field.required ? <span className="text-primary">!</span> : null}
          </label>
          {field.description ? <p className="text-[11px] text-on-surface-variant">{field.description}</p> : null}
          <FieldControl
            field={field}
            value={drafts[field.name] ?? ""}
            busy={busy}
            onChange={(next) => setDrafts((prev) => ({ ...prev, [field.name]: next }))}
          />
          {errors[field.name] ? (
            <p data-testid={`run-input-error-${field.name}`} className="text-[11px] text-error">
              {errors[field.name]}
            </p>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        data-testid="ecp-run"
        disabled={busy || disabled}
        onClick={run}
        className="inline-flex items-center gap-1.5 rounded bg-primary px-4 py-2 font-mono text-label font-bold text-on-primary hover:brightness-110 disabled:opacity-50"
      >
        <Play className="h-3.5 w-3.5" aria-hidden="true" />
        {busy ? "Running…" : "Run"}
      </button>
    </section>
  )
}
