import { createRequire } from "node:module"
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { Config } from "@oclif/core"
import { Errors } from "@oclif/core"
import { loadPluginPackage, loadPluginSchemaDocument } from "@executioncontrolprotocol/local"
import { FIRST_PARTY_PLUGINS, type ValidationIssue } from "@executioncontrolprotocol/protocol"
import { ecpDataDir } from "./home.js"

/** Regenerate hint shared with {@link loadPluginPackage}. */
export const REGENERATE_SUGGESTION = "Run ecp-plugin-manifest to regenerate."

/**
 * Plain-language reason when oclif rejects a package without `"oclif": {}`.
 * @category CLI
 */
export const OCLIF_KEY_MESSAGE =
  'ECP plugin packages need an "oclif": {} key in package.json (as ecp-plugin-manifest and first-party plugins have).'

/**
 * `@oclif/plugin-plugins` is pinned at 5.5.2; `lib/plugins.js` is not a public export.
 * @category CLI
 */
const OCLIF_PLUGIN_PLUGINS_VERSION = "5.5.2"

const require = createRequire(import.meta.url)

/** Minimal surface of oclif's {@linkplain Plugins} class used by ECP commands. */
export interface OclifPluginsCtor {
  new (options: { config: Config; logLevel?: string }): OclifPluginsInstance
}

/**
 * Methods on oclif's Plugins helper (library-only import).
 * @category CLI
 */
export interface OclifPluginsInstance {
  install(name: string, options?: { force?: boolean; tag?: string }): Promise<InstalledPluginConfig>
  link(root: string, options: { install: boolean }): Promise<InstalledPluginConfig>
  uninstall(name: string): Promise<void>
  update(): Promise<void>
  list(): Promise<Array<OclifPluginEntry>>
  hasPlugin(name: string): Promise<boolean | OclifPluginEntry>
  friendlyName(name: string): string
  unfriendlyName(name: string): string | undefined
}

interface InstalledPluginConfig {
  name: string
  version: string
  root: string
  valid?: boolean
}

/**
 * One row in the data-dir `package.json` `oclif.plugins` list.
 * @category CLI
 */
export interface OclifPluginEntry {
  name: string
  type?: string
  root?: string
  tag?: string
  url?: string
}

/**
 * Manifest sub-object returned in plugin mutation envelopes.
 * @category CLI
 */
export type PluginManifestReport = { ok: true } | { ok: false; issues: ValidationIssue[] }

/**
 * Load oclif's `Plugins` class from the pinned package (not a public export).
 * @category CLI
 */
export async function loadOclifPluginsClass(): Promise<OclifPluginsCtor> {
  const mainPath = require.resolve("@oclif/plugin-plugins")
  const packageRoot = path.dirname(path.dirname(mainPath))
  const pkgJson = path.join(packageRoot, "package.json")
  const pkg = JSON.parse(readFileSync(pkgJson, "utf8")) as { version?: string }
  if (pkg.version !== OCLIF_PLUGIN_PLUGINS_VERSION) {
    throw new Error(
      `@oclif/plugin-plugins must be ${OCLIF_PLUGIN_PLUGINS_VERSION} (found ${pkg.version ?? "unknown"})`,
    )
  }
  const pluginsJs = path.join(packageRoot, "lib/plugins.js")
  const mod = (await import(pathToFileURL(pluginsJs).href)) as { default: OclifPluginsCtor }
  return mod.default
}

/**
 * Construct an oclif `Plugins` helper with the requested npm log level.
 * @category CLI
 */
export async function createOclifPlugins(config: Config, logLevel: string): Promise<OclifPluginsInstance> {
  const Plugins = await loadOclifPluginsClass()
  return new Plugins({ config, logLevel })
}

/**
 * Expand a short plugin name to its npm package name. A plugin's package name is its plugin id, so a first-party
 * short name (`jsonata`) becomes `@executioncontrolprotocol/jsonata`; a scoped name or path is returned as given.
 * ECP resolves names itself rather than through oclif's `plugin-` prefix rule.
 * @category CLI
 */
export function expandFriendlyName(name: string, config: Config): string {
  if (name.includes("@") || name.includes("/")) return name
  const firstParty = Object.values(FIRST_PARTY_PLUGINS).find((entry) => entry.short === name)
  if (firstParty) return firstParty.packageName
  const scope = config.pjson.oclif?.scope
  return scope ? `@${scope}/${name}` : name
}

/**
 * Short name for a package in the ECP scope (`@executioncontrolprotocol/jsonata` → `jsonata`); other names unchanged.
 * @category CLI
 */
export function friendlyNameFromPackage(name: string): string {
  const match = name.match(/^@executioncontrolprotocol\/(.+)$/)
  return match?.[1] ?? name
}

/**
 * Split `name@tag` without breaking scoped names (`@scope/pkg@beta`).
 * @category CLI
 */
export function splitPackageTag(raw: string): { packageName: string; tag?: string } {
  if (raw.startsWith("@")) {
    const slash = raw.indexOf("/")
    if (slash === -1) return { packageName: raw }
    const at = raw.lastIndexOf("@")
    if (at > slash) return { packageName: raw.slice(0, at), tag: raw.slice(at + 1) }
    return { packageName: raw }
  }
  const at = raw.lastIndexOf("@")
  if (at > 0) return { packageName: raw.slice(0, at), tag: raw.slice(at + 1) }
  return { packageName: raw }
}

/**
 * Whether a token looks like a local tarball or directory path.
 * @category CLI
 */
export function isLocalPackagePath(token: string): boolean {
  if (token.includes(":")) return true
  if (token.endsWith(".tgz") || token.endsWith(".tar.gz")) return true
  try {
    return existsSync(token) || existsSync(path.resolve(token))
  } catch {
    return false
  }
}

/**
 * Turn a tarball or directory path into the `file:` URL oclif's installer expects.
 * @category CLI
 */
export function fileUrlForTarballOrPath(filePath: string): string {
  const resolved = path.resolve(filePath)
  let real = resolved
  try {
    real = realpathSync.native(resolved)
  } catch {
    try {
      real = realpathSync(resolved)
    } catch {
      real = resolved
    }
  }
  return pathToFileURL(real).href
}

/**
 * Resolve install/link/uninstall argv to an npm package name or `file:` URL.
 * @category CLI
 */
export function resolvePackageSpecifier(raw: string, config: Config): { spec: string; displayName: string; tag?: string } {
  const trimmed = raw.trim()
  if (isLocalPackagePath(trimmed)) {
    const url = trimmed.includes("://") ? trimmed : fileUrlForTarballOrPath(trimmed)
    return { spec: url, displayName: path.basename(trimmed) }
  }
  const { packageName, tag } = splitPackageTag(trimmed)
  const expanded = expandFriendlyName(packageName, config)
  return { spec: expanded, displayName: expanded, tag }
}

/**
 * npm log level: silent for `--json`, otherwise default silent unless `--verbose`.
 * @category CLI
 */
export function npmLogLevel(options: { json: boolean; verbose: boolean }): string {
  if (options.json) return "silent"
  return options.verbose ? "notice" : "silent"
}

/**
 * Touch `$ECP_DATA_DIR/.ecp-plugins-changed` so a running supervisor reloads plugins.
 * Call before {@link writeEnvelope} on mutation commands (`process.exit` skips oclif `finally`).
 * @category CLI
 */
export function touchPluginsChangedMarker(dataDir?: string): void {
  const dir = dataDir ?? ecpDataDir()
  const marker = path.join(dir, ".ecp-plugins-changed")
  writeFileSync(marker, `${Date.now()}\n`, "utf8")
}

/**
 * Validate an installed or linked plugin tree with the local loader.
 * @category CLI
 */
export async function manifestReportForRoot(
  root: string,
  source: "user" | "link",
): Promise<PluginManifestReport> {
  const loaded = await loadPluginPackage(root, source)
  if (!loaded.ok) return { ok: false, issues: loaded.issues }
  const schema = await loadPluginSchemaDocument(loaded.loaded)
  if (!schema.ok) return { ok: false, issues: schema.issues }
  return { ok: true }
}

/**
 * Map loader issues to a spec-06 envelope error.
 * @category CLI
 */
export function manifestInvalidError(issues: ValidationIssue[]): {
  code: "ECP_MANIFEST_INVALID"
  message: string
  path: string
  suggestions: string[]
} {
  const first = issues[0]
  const suggestions = [...new Set([...(first?.suggestions ?? []), REGENERATE_SUGGESTION])]
  return {
    code: "ECP_MANIFEST_INVALID",
    message: first?.message ?? "Plugin manifest is invalid.",
    path: first?.path ?? "",
    suggestions,
  }
}

/**
 * Whether an install error is oclif's missing `"oclif": {}` check.
 * @category CLI
 */
export function isMissingOclifKeyError(error: unknown): boolean {
  if (error instanceof Errors.CLIError) {
    return error.message.includes("plugin is invalid")
  }
  return String(error).includes("plugin is invalid")
}

/**
 * Envelope error when `"oclif": {}` is missing from package.json.
 * @category CLI
 */
export function missingOclifKeyError(): {
  code: "ECP_MANIFEST_INVALID"
  message: string
  path: string
  suggestions: string[]
} {
  return {
    code: "ECP_MANIFEST_INVALID",
    message: OCLIF_KEY_MESSAGE,
    path: "package.json",
    suggestions: [REGENERATE_SUGGESTION],
  }
}

/**
 * Find a plugin entry after install/link.
 * @category CLI
 */
/**
 * Whether an install spec is a URL or `file:` location rather than an npm name.
 * @category CLI
 */
export function isUrlInstallSpec(spec: string): boolean {
  return spec.includes("://") || spec.includes(":")
}

/**
 * Find a user plugin row installed from the same URL spec.
 * @category CLI
 */
export async function findPluginByUrl(
  plugins: OclifPluginsInstance,
  spec: string,
): Promise<OclifPluginEntry | undefined> {
  const list = await plugins.list()
  return list.find((entry) => entry.url === spec || entry.url === spec.replace(/^file:\/\//, "file:"))
}

/**
 * Whether the spec is already listed in the data-dir plugin manifest.
 * @category CLI
 */
export async function isPluginSpecInstalled(
  plugins: OclifPluginsInstance,
  spec: string,
  config: Config,
): Promise<OclifPluginEntry | false> {
  if (isUrlInstallSpec(spec)) {
    const byUrl = await findPluginByUrl(plugins, spec)
    return byUrl ?? false
  }
  const unfriendly = expandFriendlyName(spec, config)
  const hit = await plugins.hasPlugin(unfriendly)
  if (!hit) return false
  if (typeof hit === "object") return hit
  return (await findPluginEntry(plugins, unfriendly)) ?? false
}

export async function findPluginEntry(
  plugins: OclifPluginsInstance,
  packageName: string,
): Promise<OclifPluginEntry | undefined> {
  const list = await plugins.list()
  const friendly = friendlyNameFromPackage(packageName)
  return (
    list.find((entry) => entry.name === packageName) ??
    list.find((entry) => friendlyNameFromPackage(entry.name) === friendly)
  )
}

/**
 * Absolute path used for a non-link plugin.
 * @category CLI
 */
export function userPluginRoot(dataDir: string, packageName: string): string {
  return path.join(dataDir, "node_modules", packageName)
}

/**
 * Guard against uninstalling the CLI package itself.
 * @category CLI
 */
export function isCliPackageName(name: string, config: Config): boolean {
  const self = config.pjson.name
  return Boolean(self && (name === self || expandFriendlyName(name, config) === self))
}

/**
 * Read `version` from a package root when present.
 * @category CLI
 */
export function readPackageVersion(root: string): string {
  try {
    const pjson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { version?: string }
    return pjson.version ?? ""
  } catch {
    return ""
  }
}

/** Directory of this module (for tests that resolve relative paths). */
export const pluginMgmtDir = path.dirname(fileURLToPath(import.meta.url))