import type { ArtifactStore } from "@executioncontrolprotocol/protocol"
import { assertSafeRunId, isSafeArtifactName } from "@executioncontrolprotocol/protocol"

function isSafeRunIdValue(runId: string): boolean {
  try {
    assertSafeRunId(runId)
    return true
  } catch {
    return false
  }
}

/**
 * Resolved artifact body for the HTTP preview route.
 * @category Host
 */
export interface ArtifactHttpBody {
  /** Response body. */
  body: ReadableStream<Uint8Array> | Uint8Array
  /** `Content-Type` value. */
  mediaType: string
}

/**
 * Load one run artifact for streaming on `GET /v1/runs/:runId/artifacts/:name`.
 * @category Host
 */
export async function readRunArtifactForHttp(
  store: ArtifactStore,
  runId: string,
  name: string,
): Promise<ArtifactHttpBody | { code: "ECP_NOT_FOUND"; message: string }> {
  // The same rules every store enforces: one safe path segment, so nothing outside the run can be addressed.
  if (!isSafeArtifactName(name) || !isSafeRunIdValue(runId)) {
    return { code: "ECP_NOT_FOUND", message: `Artifact ${name} was not found.` }
  }
  const stat = await store.stat(runId, name)
  if (!stat) {
    return { code: "ECP_NOT_FOUND", message: `Artifact ${name} was not found.` }
  }
  const stream = await store.getStream(runId, name)
  return { body: stream, mediaType: stat.mediaType ?? "application/octet-stream" }
}