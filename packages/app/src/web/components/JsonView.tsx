import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"

/**
 * Read-only JSON of the open manifest (the last version that parsed).
 * @category App
 */
export function JsonView({ manifest }: { manifest?: ExecutionManifest }) {
  return (
    <pre
      data-testid="json-view"
      className="h-full min-h-[240px] overflow-auto rounded border border-outline-variant bg-surface-container-lowest p-3 font-mono text-[12px] leading-relaxed text-on-surface"
    >
      {manifest ? JSON.stringify(manifest, null, 2) : ""}
    </pre>
  )
}
