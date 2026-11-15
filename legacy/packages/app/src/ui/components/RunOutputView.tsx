import { useEffect, useMemo, useState } from "react"
import type { ReactFlowPort } from "../../graph/index.js"
import { runFormPortsFromReturns } from "../lib/workflow-io.js"
import { draftForPort } from "../lib/step-configure.js"
import {
  isMediaReturnValue,
  mediaRefsForReturnValue,
  valueForReturnPort,
} from "../lib/run-output-view.js"
import {
  resolveMediaPreview,
  type ReadMediaFn,
  type ResolvedMediaPreview,
} from "../lib/resolve-media-preview.js"
import { SchemaPortField } from "./ConfigFieldControl.js"
import { MediaPreview } from "./MediaPreview.js"

/** Props for {@link RunOutputView}. @category App */
export interface RunOutputViewProps {
  /** Workflow `returns` JSON Schema. */
  returnsSchema?: Record<string, unknown>
  /** `result.output` object (or undefined when empty). */
  output?: unknown
  /** Resolve a host media URI for preview. */
  onReadMedia?: ReadMediaFn
  /** Compact layout. */
  compact?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function openNative(item: ResolvedMediaPreview): void {
  if (!item.url) return
  window.open(item.url, "_blank", "noopener,noreferrer")
}

function ReturnMediaField({
  port,
  value,
  onReadMedia,
}: {
  port: ReactFlowPort
  value: unknown
  onReadMedia?: ReadMediaFn
}) {
  const refs = useMemo(() => mediaRefsForReturnValue(port.name, value), [port.name, value])
  const [previews, setPreviews] = useState<ResolvedMediaPreview[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (refs.length === 0) {
      setPreviews([])
      setLoading(false)
      return
    }
    let cancelled = false
    const created: string[] = []
    setLoading(true)
    void (async () => {
      const resolved = await Promise.all(refs.map((ref) => resolveMediaPreview(ref, { readMedia: onReadMedia })))
      if (cancelled) {
        for (const item of resolved) {
          if (item.revokeUrl && item.url) URL.revokeObjectURL(item.url)
        }
        return
      }
      for (const item of resolved) {
        if (item.revokeUrl && item.url) created.push(item.url)
      }
      setPreviews(resolved)
      setLoading(false)
    })()
    return () => {
      cancelled = true
      for (const url of created) URL.revokeObjectURL(url)
      setPreviews((prev) => {
        for (const item of prev) {
          if (item.revokeUrl && item.url) URL.revokeObjectURL(item.url)
        }
        return []
      })
    }
  }, [refs, onReadMedia])

  if (loading) {
    return <p className="text-label text-on-surface-variant">Loading preview…</p>
  }
  if (refs.length === 0) {
    return (
      <SchemaPortField
        fieldId={`run-out-${port.name}`}
        port={port}
        value={draftForPort(port, value)}
        busy={false}
        readOnly
        onChange={() => undefined}
      />
    )
  }
  return (
    <ul className="space-y-3">
      {previews.map((item) => (
        <li
          key={item.path}
          className="rounded border border-outline-variant/40 bg-surface-container-lowest p-2"
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-mono text-label text-on-surface">{item.path}</p>
              <p className="font-mono text-label text-on-surface-variant">
                {item.name ? `${item.name} · ` : ""}
                {item.mediaType}
              </p>
            </div>
            <button
              type="button"
              disabled={!item.url}
              onClick={() => openNative(item)}
              className="rounded bg-primary px-2.5 py-1 font-mono text-label font-bold text-on-primary hover:brightness-110 disabled:opacity-40"
            >
              Open
            </button>
          </div>
          <MediaPreview item={item} />
        </li>
      ))}
    </ul>
  )
}

/**
 * Schema-mapped read-only view of `result.output`.
 * Uses the same {@link SchemaPortField} widgets as run input.
 * @category App
 */
export function RunOutputView({
  returnsSchema,
  output,
  onReadMedia,
  compact = false,
}: RunOutputViewProps) {
  const ports = useMemo(() => runFormPortsFromReturns(returnsSchema), [returnsSchema])
  const hasOutputObject = isRecord(output)
  const outputEmpty =
    output === undefined ||
    output === null ||
    (hasOutputObject && Object.keys(output).length === 0)

  if (ports.length === 0) {
    return (
      <p className="text-label text-on-surface-variant">
        {outputEmpty ? "No returns schema or output to display." : "No returns schema to map."}
      </p>
    )
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {!compact ? (
        <p className="font-mono text-label uppercase tracking-wide text-on-surface-variant">
          Output
        </p>
      ) : null}
      {ports.map((port) => {
        const value = valueForReturnPort(output, port.name)
        if (isMediaReturnValue(port, value)) {
          return (
            <div key={port.id} className="space-y-1.5">
              <span className="font-mono text-label text-on-surface">
                {port.name}
                <span className="text-outline">:{port.typeLabel}</span>
              </span>
              <ReturnMediaField port={port} value={value} onReadMedia={onReadMedia} />
            </div>
          )
        }
        return (
          <SchemaPortField
            key={port.id}
            fieldId={`run-out-${port.name}`}
            port={port}
            value={draftForPort(port, value)}
            busy={false}
            readOnly
            onChange={() => undefined}
          />
        )
      })}
    </div>
  )
}
