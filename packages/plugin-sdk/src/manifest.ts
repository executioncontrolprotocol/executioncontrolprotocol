import {
  PLUGIN_MANIFEST_SCHEMA,
  PLUGIN_MANIFEST_VERSION,
  type PluginCapabilityManifest,
  type PluginManifest,
} from "@executioncontrolprotocol/protocol"
import { z } from "zod"
import { canonicalJson, sha256Hex } from "./canonical.js"
import type { CapabilityDefinition, PluginDefinition } from "./define.js"
import { PluginDefinitionError } from "./define.js"
import { VERSION } from "./version.js"

/**
 * Package.json fields the manifest bin reads.
 * @category Plugins
 */
export interface PackageJsonInfo {
  /** npm package name. */
  name: string
  /** Package version. */
  version: string
}

/**
 * Options for {@link buildPluginManifest}.
 * @category Plugins
 */
export interface BuildManifestOptions {
  /** Plugin definition (default export of the entry). */
  definition: PluginDefinition
  /** Surrounding package.json. */
  packageJson: PackageJsonInfo
  /** Relative entry path written into the manifest. Default `./dist/index.js`. */
  entry?: string
  /** SDK version stamped into the manifest. Default {@link VERSION}. */
  sdkVersion?: string
}

/**
 * Convert a zod schema to a JSON Schema object for the manifest.
 * @category Plugins
 */
export function zodToJsonSchema(schema: z.ZodType, io: "input" | "output"): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { target: "draft-2020-12", io }) as Record<string, unknown>
  return stripSchemaKeys(sortKeys(raw)) as Record<string, unknown>
}

/**
 * Build a deterministic {@link PluginManifest} from a definition and package.json.
 * @category Plugins
 */
export async function buildPluginManifest(options: BuildManifestOptions): Promise<PluginManifest> {
  const { definition, packageJson } = options
  if (packageJson.version === undefined || packageJson.version === "") {
    throw new PluginDefinitionError("ECP_PLUGIN_MANIFEST", "package.json is missing version.")
  }
  if (!packageJson.name) {
    throw new PluginDefinitionError("ECP_PLUGIN_MANIFEST", "package.json is missing name.")
  }

  const capabilities: PluginCapabilityManifest[] = Object.entries(definition.capabilities).map(([name, cap]) =>
    toCapabilityManifest(definition.id, name, cap),
  )
  capabilities.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))

  const withoutHash: Omit<PluginManifest, "hash"> = {
    schema: PLUGIN_MANIFEST_SCHEMA,
    version: PLUGIN_MANIFEST_VERSION,
    plugin: {
      id: definition.id,
      package: packageJson.name,
      version: packageJson.version,
      summary: definition.summary,
      description: definition.description,
    },
    sdkVersion: options.sdkVersion ?? VERSION,
    ...(definition.config ? { configSchema: zodToJsonSchema(definition.config, "input") } : {}),
    capabilities,
    entry: options.entry ?? "./dist/index.js",
  }

  const sorted = sortKeys(withoutHash) as Omit<PluginManifest, "hash">
  const hash = await sha256Hex(canonicalJson(sorted))
  return { ...sorted, hash }
}

/**
 * Serialize a manifest as deterministic JSON with a trailing newline.
 * @category Plugins
 */
export function serializeManifest(manifest: PluginManifest): string {
  return `${JSON.stringify(sortKeys(manifest), null, 2)}\n`
}

function toCapabilityManifest(
  pluginId: string,
  name: string,
  cap: CapabilityDefinition,
): PluginCapabilityManifest {
  return {
    id: `${pluginId}.${name}`,
    name,
    summary: cap.summary,
    description: cap.description,
    useCases: [...cap.useCases],
    projections: [...cap.projections],
    accepts: zodToJsonSchema(cap.accepts, "input"),
    returns: zodToJsonSchema(cap.returns, "output"),
    ...(cap.timeoutMs === undefined ? {} : { timeoutMs: cap.timeoutMs }),
  }
}

function stripSchemaKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stripSchemaKeys(item))
  if (typeof value !== "object" || value === null) return value
  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (key === "$schema") continue
    output[key] = stripSchemaKeys(child)
  }
  return output
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sortKeys(item))
  if (typeof value !== "object" || value === null) return value
  const output: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) {
    output[key] = sortKeys((value as Record<string, unknown>)[key])
  }
  return output
}
