import { useEffect, useMemo, useState } from "react"
import type { FileRef } from "@executioncontrolprotocol/core/types"
import type { ReactFlowPort } from "../../graph/index.js"
import { ConfigPortControl } from "./ConfigFieldControl.js"
import { draftForPort, editorKindForPort, parseEditedLiteral } from "../lib/step-configure.js"
import { runFormPortsFromAccepts } from "../lib/workflow-io.js"
import { fileRefToDraft } from "../lib/run-form-files.js"
import { fileAcceptFromValueSchema } from "../lib/file-accept.js"

/** Props for {@link RunInputForm}. @category App */
export interface RunInputFormProps {
  /** True while a run is in flight. */
  runBusy: boolean
  /** Start a run with collected accepts input. */
  onRun: (input?: Record<string, unknown>) => void
  /** True when a compiled workflow is loaded. */
  hasWorkflow: boolean
  /** Workflow `accepts` JSON Schema. */
  acceptsSchema?: Record<string, unknown>
  /** Upload a picked file through the host media store. */
  onUploadFile?: (file: File) => Promise<FileRef>
}

/** Collects `accepts` input and runs the workflow. @category App */
export function RunInputForm({
  runBusy,
  onRun,
  hasWorkflow,
  acceptsSchema,
  onUploadFile,
}: RunInputFormProps) {
  const ports = useMemo(() => runFormPortsFromAccepts(acceptsSchema), [acceptsSchema])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const next: Record<string, string> = {}
    for (const port of ports) {
      next[port.name] = draftForPort(port, undefined)
    }
    setDrafts(next)
    setFieldErrors({})
  }, [ports])

  const applyFile = async (port: ReactFlowPort, file: File) => {
    if (!onUploadFile) return
    try {
      const ref = await onUploadFile(file)
      setDrafts((prev) => ({ ...prev, [port.name]: fileRefToDraft(ref) }))
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next[port.name]
        return next
      })
    } catch (err) {
      setFieldErrors((prev) => ({
        ...prev,
        [port.name]: err instanceof Error ? err.message : String(err),
      }))
    }
  }

  const handleRun = () => {
    if (ports.length === 0) {
      onRun()
      return
    }
    const input: Record<string, unknown> = {}
    const errors: Record<string, string> = {}
    for (const port of ports) {
      const draft = drafts[port.name] ?? ""
      const parsed = parseEditedLiteral(
        draft,
        undefined,
        port.typeLabel,
        port.valueSchema,
        port.name
      )
      if (!parsed.ok) {
        errors[port.name] = parsed.error
        continue
      }
      input[port.name] = parsed.value
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    onRun(input)
  }

  return (
    <section>
      {ports.length > 0 ? (
        <div className="mb-4 space-y-3">
          <p className="font-mono text-label uppercase tracking-wide text-on-surface-variant">
            Run input
          </p>
          {ports.map((port: ReactFlowPort) => {
            const kind = editorKindForPort(port)
            return (
              <div key={port.id} className="space-y-1.5">
                <span className="font-mono text-label text-on-surface">
                  {port.name}
                  <span className="text-outline">:{port.typeLabel}</span>
                </span>
                <ConfigPortControl
                  fieldId={`run-${port.name}`}
                  port={port}
                  value={drafts[port.name] ?? ""}
                  busy={runBusy}
                  onChange={(next) => setDrafts((prev) => ({ ...prev, [port.name]: next }))}
                  filePickerEnabled={Boolean(onUploadFile)}
                  accept={fileAcceptFromValueSchema(port.valueSchema)}
                  onFile={kind === "file" ? (file) => void applyFile(port, file) : undefined}
                />
                {fieldErrors[port.name] ? (
                  <span className="block text-label text-error">{fieldErrors[port.name]}</span>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
      <button
        type="button"
        data-testid="ecp-run"
        disabled={runBusy || !hasWorkflow}
        onClick={handleRun}
        className="rounded bg-primary px-4 py-2 font-mono text-label font-bold text-on-primary hover:brightness-110 disabled:opacity-50"
      >
        {runBusy ? "Running..." : "Run workflow"}
      </button>
    </section>
  )
}
