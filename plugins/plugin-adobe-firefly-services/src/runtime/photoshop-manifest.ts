/**
 * Photoshop generate-manifest final document schema + fetch helpers.
 * @category Runtime
 */
import { z } from "zod"

/**
 * Recursive PSD manifest layer (id/name are the primary workflow refs).
 * @category Runtime
 */
export const photoshopManifestLayerSchema: z.ZodTypeAny = z.lazy(() =>
  z
    .object({
      id: z.number().int().optional(),
      name: z.string().optional(),
      type: z.string().optional(),
      visible: z.boolean().optional(),
      layers: z.array(photoshopManifestLayerSchema).optional(),
    })
    .passthrough(),
)

/**
 * PSD manifest JSON returned by {@code photoshop-generate-manifest} after polling.
 * Extra Adobe fields are preserved via passthrough.
 * @category Runtime
 */
export const photoshopManifestDocumentSchema: z.ZodTypeAny = z
  .object({
    layers: z.array(photoshopManifestLayerSchema).optional(),
    name: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    resolution: z.number().optional(),
    iccProfileName: z.string().optional(),
  })
  .passthrough()

/**
 * Collect HTTPS destination URLs from a generate-manifest request body.
 * @category Runtime
 */
export function collectManifestDestinationUrls(requestBody: unknown): string[] {
  if (!requestBody || typeof requestBody !== "object") return []
  const outputs = (requestBody as { outputs?: unknown }).outputs
  if (!Array.isArray(outputs)) return []
  const urls: string[] = []
  for (const entry of outputs) {
    if (!entry || typeof entry !== "object") continue
    const dest = (entry as { destination?: unknown }).destination
    if (!dest || typeof dest !== "object") continue
    const url = (dest as { url?: unknown }).url
    if (typeof url === "string" && /^https?:\/\//i.test(url)) urls.push(url)
  }
  return urls
}

/**
 * Try to read an embedded / inline JSON manifest from a completed job status body.
 * @category Runtime
 */
export function extractEmbeddedManifestJson(jobStatus: unknown): unknown | undefined {
  if (!jobStatus || typeof jobStatus !== "object") return undefined
  const result = (jobStatus as { result?: unknown }).result
  if (!result || typeof result !== "object") return undefined
  const record = result as Record<string, unknown>

  // Hosted / embedded destinations sometimes place JSON under outputs.
  const outputs = record.outputs
  if (outputs && typeof outputs === "object") {
    for (const value of Object.values(outputs as Record<string, unknown>)) {
      if (value && typeof value === "object") {
        const nested = value as Record<string, unknown>
        if (Array.isArray(nested.layers) || typeof nested.layers === "object") return value
        if (typeof nested.manifest === "object" && nested.manifest) return nested.manifest
        if (typeof nested.document === "object" && nested.document) return nested.document
      }
    }
  }

  if (Array.isArray(record.layers)) return result
  if (typeof record.manifest === "object" && record.manifest) return record.manifest
  return undefined
}

/**
 * Materialize the PSD manifest JSON after generate-manifest job success.
 * Prefers embedded job payload; otherwise GETs the first HTTPS output destination.
 * @category Runtime
 */
export async function materializePhotoshopManifest(options: {
  /** Completed job status body. */
  jobStatus: unknown
  /** Original generate-manifest request body. */
  requestBody: unknown
  /** Fetch implementation (defaults to global fetch; used for Azure SAS URLs). */
  fetchImpl?: typeof fetch
}): Promise<unknown> {
  const embedded = extractEmbeddedManifestJson(options.jobStatus)
  if (embedded !== undefined) return embedded

  const urls = collectManifestDestinationUrls(options.requestBody)
  if (urls.length === 0) {
    throw new Error(
      "photoshop-generate-manifest completed but no embedded manifest or HTTPS output destination was found",
    )
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const res = await fetchImpl(urls[0]!, { method: "GET", headers: { Accept: "application/json" } })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Failed to download PSD manifest from destination (${res.status}): ${text.slice(0, 300)}`)
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error("PSD manifest destination did not return JSON")
  }
}
