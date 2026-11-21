import { fileRefSchema } from "@executioncontrolprotocol/plugin-sdk"
import type { FileRef as EcpFileRef } from "@executioncontrolprotocol/protocol"

/**
 * Portable file reference accepted by Adobe Firefly Services capabilities.
 * @category Plugins
 */
export { fileRefSchema }

/**
 * Parsed {@link fileRefSchema} value.
 * @category Plugins
 */
export type FileRef = EcpFileRef