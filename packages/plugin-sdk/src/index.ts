/**
 * Plugin authoring API and manifest conversion.
 * @category Plugins
 */
export { VERSION } from "./version.js"
export {
  capability,
  definePlugin,
  PluginDefinitionError,
} from "./define.js"
export type {
  CapabilityDefinition,
  CapabilityInput,
  CapabilityOptions,
  CapabilityOutput,
  Handler,
  HandlerThunk,
  PluginConfig,
  PluginDefinition,
} from "./define.js"
export {
  buildPluginManifest,
  buildPluginSchemaDocument,
  serializeManifest,
  serializePluginSchema,
  zodToJsonSchema,
} from "./manifest.js"
export type {
  BuildManifestOptions,
  BuildPluginSchemaOptions,
  PackageJsonInfo,
} from "./manifest.js"
export { canonicalJson, sha256Hex } from "./canonical.js"

export type {
  ArtifactFileRef,
  FileBytes,
  FileRef,
  FileRefFile,
  FileRefUrl,
  HandlerContext,
  HandlerStore,
  StateHandle,
} from "@executioncontrolprotocol/protocol"
