/**
 * Artifact names and URIs. Every {@link ArtifactStore} implementation enforces the same rules, so an artifact name
 * can never address anything outside its run, whatever the backing storage is.
 */

/** One path segment: letters, digits, `.`, `_`, `-`; no leading dot; at most 200 characters. */
const SAFE_NAME = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,199}$/

/** Run ids as minted by the host (`run-<timestamp>-<hex>`), and other simple ids used in tests. */
const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

const ARTIFACT_URI = /^ecp:\/\/runs\/([^/]+)\/artifacts\/([^/]+)$/

/**
 * Whether `name` is a safe artifact (or scratch) file name: a single path segment, not `.` or `..`.
 * @category Plugins
 */
export function isSafeArtifactName(name: string): boolean {
  return SAFE_NAME.test(name) && name !== "." && name !== ".."
}

/**
 * Throw `ECP_INPUT_INVALID` unless `name` is a safe artifact name.
 * @category Plugins
 */
export function assertSafeArtifactName(name: string): void {
  if (!isSafeArtifactName(name)) {
    throw Object.assign(
      new Error(
        `Artifact name ${JSON.stringify(name)} is not allowed; use one path segment of letters, digits, ".", "_" or "-".`,
      ),
      { code: "ECP_INPUT_INVALID" },
    )
  }
}

/**
 * Throw `ECP_INPUT_INVALID` unless `runId` is a safe run id.
 * @category Plugins
 */
export function assertSafeRunId(runId: string): void {
  if (!SAFE_RUN_ID.test(runId)) {
    throw Object.assign(new Error(`Run id ${JSON.stringify(runId)} is not valid.`), { code: "ECP_INPUT_INVALID" })
  }
}

/**
 * Turn any string into a safe artifact name, keeping the extension where possible (for example a URL's last path
 * segment). Falls back to `fallback` when nothing usable is left.
 * @category Plugins
 */
export function toSafeArtifactName(raw: string | undefined, fallback: string): string {
  const cleaned = (raw ?? "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.-]+/, "")
    .slice(0, 200)
  return isSafeArtifactName(cleaned) ? cleaned : fallback
}

/**
 * Canonical artifact URI. Independent of where the bytes are stored.
 * @category Plugins
 */
export function artifactUri(runId: string, name: string): string {
  return `ecp://runs/${runId}/artifacts/${name}`
}

/**
 * Split an artifact URI into run id and name, checking both. Throws `ECP_INPUT_INVALID` on anything else.
 * @category Plugins
 */
export function parseArtifactUri(uri: string): { runId: string; name: string } {
  const match = ARTIFACT_URI.exec(uri)
  if (!match) {
    throw Object.assign(new Error(`Not an artifact URI: ${JSON.stringify(uri)}.`), { code: "ECP_INPUT_INVALID" })
  }
  const runId = decodeURIComponent(match[1]!)
  const name = decodeURIComponent(match[2]!)
  assertSafeRunId(runId)
  assertSafeArtifactName(name)
  return { runId, name }
}
