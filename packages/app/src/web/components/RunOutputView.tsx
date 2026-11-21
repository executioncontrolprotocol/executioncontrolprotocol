import { useEffect, useState } from "react"
import type { ValidationIssue } from "@executioncontrolprotocol/protocol"
// Subpath import: the package root reads its version with node:module and is not browser-safe.
import { walkFileRefs } from "@executioncontrolprotocol/protocol/file-refs"
import type { AppHostClient } from "../../client/index.js"

const INLINE_MAX_BYTES = 8 * 1024 * 1024

/**
 * Props for {@link RunOutputView}.
 * @category App
 */
export interface RunOutputViewProps {
  /** Run result (keys selected by `execution.returns`), or null before the run ends. */
  result?: Record<string, unknown> | null
  /** Failure issue, when the run failed. */
  error?: ValidationIssue | null
  /** Run id for artifact preview URLs. */
  runId?: string
  /** Host client (bearer auth for artifact fetch). */
  client?: AppHostClient
}

interface PreviewTarget {
  key: string
  name: string
  mediaType?: string
  sizeBytes?: number
}

function collectPreviews(result: Record<string, unknown>): PreviewTarget[] {
  const items: PreviewTarget[] = []
  walkFileRefs(result, (ref, pointer) => {
    const archive = ref.archive
    if (!archive?.name) return
    items.push({
      key: pointer || archive.name,
      name: archive.name,
      mediaType: archive.mediaType ?? ref.mediaType,
      sizeBytes: archive.sizeBytes,
    })
  })
  return items
}

/**
 * Inline image preview when size is within {@link INLINE_MAX_BYTES}.
 * @category App
 */
function CapturedImagePreview({
  runId,
  name,
  client,
  mediaType,
}: {
  runId: string
  name: string
  client: AppHostClient
  mediaType?: string
}) {
  const [src, setSrc] = useState<string | undefined>()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let objectUrl: string | undefined
    let cancelled = false
    void (async () => {
      try {
        const blob = await client.fetchArtifact(runId, name)
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [client, name, runId])
  if (failed) {
    return (
      <a className="text-[12px] text-primary underline" href={client.artifactPath(runId, name)}>
        {name}
      </a>
    )
  }
  if (!src) return <p className="text-[11px] text-on-surface-variant">Loading {name}…</p>
  return (
    <img
      data-testid="capture-preview"
      data-artifact={name}
      src={src}
      alt={name}
      className="max-h-64 max-w-full rounded border border-outline-variant"
      {...(mediaType ? { "data-media-type": mediaType } : {})}
    />
  )
}

/**
 * Read-only view of a run's result JSON, or its failure issue with suggestions.
 * @category App
 */
export function RunOutputView({ result, error, runId, client }: RunOutputViewProps) {
  if (error) {
    return (
      <section data-testid="run-error" className="space-y-2 rounded border border-error/40 bg-surface-container-lowest p-3">
        <p className="font-mono text-label text-error">{error.code}</p>
        <p className="text-sm text-on-surface">{error.message}</p>
        {error.path ? <p className="font-mono text-[11px] text-on-surface-variant">{error.path}</p> : null}
        {error.suggestions && error.suggestions.length > 0 ? (
          <ul className="list-disc space-y-1 pl-4 text-[12px] text-on-surface-variant">
            {error.suggestions.map((suggestion) => (
              <li key={suggestion}>{suggestion}</li>
            ))}
          </ul>
        ) : null}
      </section>
    )
  }
  if (result === undefined || result === null) {
    return <p className="text-label text-on-surface-variant">No result yet.</p>
  }
  const previews = collectPreviews(result)
  return (
    <section data-testid="run-result" className="space-y-2">
      <p className="font-mono text-label uppercase text-on-surface-variant">Result</p>
      {previews.length > 0 && runId && client ? (
        <ul className="space-y-2" data-testid="capture-previews">
          {previews.map((item) => {
            const isImage = item.mediaType?.startsWith("image/") === true
            const withinLimit = item.sizeBytes === undefined || item.sizeBytes <= INLINE_MAX_BYTES
            if (isImage && withinLimit) {
              return (
                <li key={item.key}>
                  <CapturedImagePreview runId={runId} name={item.name} client={client} mediaType={item.mediaType} />
                </li>
              )
            }
            return (
              <li key={item.key}>
                {client ? (
                  <a className="font-mono text-[12px] text-primary underline" href={client.artifactPath(runId, item.name)}>
                    {item.name}
                  </a>
                ) : (
                  <span className="font-mono text-[12px] text-on-surface">{item.name}</span>
                )}
              </li>
            )
          })}
        </ul>
      ) : null}
      <pre className="max-h-80 overflow-auto rounded border border-outline-variant bg-surface-container-lowest p-3 font-mono text-[12px] text-on-surface">
        {JSON.stringify(result, null, 2)}
      </pre>
    </section>
  )
}