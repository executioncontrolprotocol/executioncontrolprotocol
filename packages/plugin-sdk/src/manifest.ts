import {
  PLUGIN_MANIFEST_SCHEMA,
  PLUGIN_MANIFEST_VERSION,
  type PluginCapabilityManifest,
  type PluginManifest,
  type PluginSchemaDocument,
} from "@executioncontrolprotocol/protocol"
import { z } from "zod"
import { canonicalJson, sha256Hex } from "./canonical.js"
import type { CapabilityDefinition, PluginDefinition } from "./define.js"
import { PluginDefinitionError } from "./define.js"
import { VERSION } from "./version.js"

/** Relative path written into light manifests for the schema document. */
const DEFAULT_SCHEMA_PATH = "./ecp.schema.json"

/** Draft id stamped on written `ecp.schema.json` files. */
const JSON_SCHEMA_DRAFT = "https://json-schema.org/draft/2020-12/schema"

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
  /** Relative path for `pluginSchema.path`. Default `./ecp.schema.json`. */
  schemaPath?: string
  /** Pre-built schema document. When omitted, one is built from the definition. */
  schemaDocument?: PluginSchemaDocument
}

/**
 * Options for {@link buildPluginSchemaDocument}.
 * @category Plugins
 */
export interface BuildPluginSchemaOptions {
  /** Plugin definition (default export of the entry). */
  definition: PluginDefinition
  /** Surrounding package.json. */
  packageJson: PackageJsonInfo
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
 * Build the per-plugin {@link PluginSchemaDocument} (`ecp.schema.json`).
 * @category Plugins
 */
export async function buildPluginSchemaDocument(
  options: BuildPluginSchemaOptions,
): Promise<PluginSchemaDocument> {
  const { definition, packageJson } = options
  assertPackageJson(packageJson)

  const defs: Record<string, Record<string, unknown>> = {}
  const names = Object.keys(definition.capabilities).sort()
  for (const name of names) {
    const cap = definition.capabilities[name]
    if (!cap) continue
    defs[`${name}.accepts`] = zodToJsonSchema(cap.accepts, "input")
    defs[`${name}.returns`] = zodToJsonSchema(cap.returns, "output")
  }
  if (definition.config) {
    defs.config = zodToJsonSchema(definition.config, "input")
  }

  return sortKeys({
    $schema: JSON_SCHEMA_DRAFT,
    $id: `ecp://plugins/${definition.id}/${packageJson.version}/schema.json`,
    $defs: defs,
  }) as PluginSchemaDocument
}

/**
 * Build a deterministic light {@link PluginManifest} from a definition and package.json.
 * @category Plugins
 */
export async function buildPluginManifest(options: BuildManifestOptions): Promise<PluginManifest> {
  const { definition, packageJson } = options
  assertPackageJson(packageJson)

  const schemaDocument =
    options.schemaDocument ??
    (await buildPluginSchemaDocument({ definition, packageJson }))
  const schemaHash = await sha256Hex(canonicalJson(schemaDocument))

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
    pluginSchema: {
      path: options.schemaPath ?? DEFAULT_SCHEMA_PATH,
      hash: schemaHash,
    },
    capabilities,
    entry: options.entry ?? "./dist/index.js",
  }

  const sorted = sortKeys(withoutHash) as Omit<PluginManifest, "hash">
  const hash = await sha256Hex(canonicalJson(sorted))
  return { ...sorted, hash }
}

/**
 * Serialize a light manifest as deterministic JSON with a trailing newline.
 * @category Plugins
 */
export function serializeManifest(manifest: PluginManifest): string {
  return `${JSON.stringify(sortKeys(manifest), null, 2)}\n`
}

/**
 * Serialize a plugin schema document as deterministic JSON with a trailing newline.
 * @category Plugins
 */
export function serializePluginSchema(doc: PluginSchemaDocument): string {
  return `${JSON.stringify(sortKeys(doc), null, 2)}\n`
}

function assertPackageJson(packageJson: PackageJsonInfo): void {
  if (packageJson.version === undefined || packageJson.version === "") {
    throw new PluginDefinitionError("ECP_PLUGIN_MANIFEST", "package.json is missing version.")
  }
  if (!packageJson.name) {
    throw new PluginDefinitionError("ECP_PLUGIN_MANIFEST", "package.json is missing name.")
  }
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
