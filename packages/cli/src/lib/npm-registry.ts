/** Default npm registry origin. @category CLI */
export const DEFAULT_NPM_REGISTRY = "https://registry.npmjs.org"

/**
 * npm registry origin, overridable with `ECP_NPM_REGISTRY` for tests.
 * @category CLI
 */
export function npmRegistryOrigin(): string {
  return (process.env.ECP_NPM_REGISTRY ?? DEFAULT_NPM_REGISTRY).replace(/\/$/, "")
}

/** One hit from the npm search API. @category CLI */
export interface NpmSearchHit {
  /** Package name. */
  name: string
  /** Latest version. */
  version: string
  /** Package description. */
  description?: string
  /** npm modified date. */
  date?: string
  /** Keywords. */
  keywords?: string[]
}

interface NpmSearchResponse {
  objects?: Array<{
    package?: {
      name?: string
      version?: string
      description?: string
      date?: string
      keywords?: string[]
    }
  }>
}

/**
 * Search npm for `ecosystem:ecp-plugin` packages.
 * @category CLI
 */
export async function searchEcpPlugins(query = ""): Promise<NpmSearchHit[]> {
  const text = ["keywords:ecosystem:ecp-plugin", query.trim()].filter(Boolean).join(" ")
  const url = `${npmRegistryOrigin()}/-/v1/search?text=${encodeURIComponent(text)}&size=250`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`npm search failed (${response.status})`)
  }
  const body = (await response.json()) as NpmSearchResponse
  return (body.objects ?? [])
    .map((entry) => entry.package)
    .filter((pkg): pkg is NonNullable<typeof pkg> => Boolean(pkg?.name))
    .map((pkg) => ({
      name: String(pkg.name),
      version: String(pkg.version ?? ""),
      description: pkg.description,
      date: pkg.date,
      keywords: pkg.keywords,
    }))
}

/**
 * True when the package exists on the registry.
 * @category CLI
 */
export async function npmPackageExists(name: string): Promise<boolean> {
  const url = `${npmRegistryOrigin()}/${name.replace("/", "%2f")}`
  const response = await fetch(url, { method: "HEAD" })
  if (response.status === 404) return false
  if (response.ok) return true
  if (response.status === 405 || response.status === 400) {
    const get = await fetch(url)
    return get.ok
  }
  return false
}

/**
 * Latest version string from the registry, or undefined when missing.
 * @category CLI
 */
export async function npmLatestVersion(name: string): Promise<string | undefined> {
  const url = `${npmRegistryOrigin()}/${name.replace("/", "%2f")}`
  const response = await fetch(url)
  if (!response.ok) return undefined
  const body = (await response.json()) as { "dist-tags"?: { latest?: string } }
  return body["dist-tags"]?.latest
}

/**
 * First-party packages live under `@executioncontrolprotocol/`.
 * @category CLI */
export function isFirstPartyPackage(name: string): boolean {
  return name.startsWith("@executioncontrolprotocol/")
}
