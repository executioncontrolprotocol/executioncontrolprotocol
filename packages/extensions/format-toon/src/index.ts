import { catalogExtension, globalRegistry } from "@executioncontrolprotocol/core"
import { formatToonExtension } from "./extension.js"

catalogExtension(formatToonExtension)

export { formatToonExtension } from "./extension.js"
export { encodeToToon, encodeWorkflowToToon } from "./encode.js"
export { decodeFromToon, decodeToonToWorkflow } from "./decode.js"
export {
  encodeDocumentToToon,
  decodeDocumentFromToon,
  type EncodeDocumentToToonOptions,
  type DecodeDocumentFromToonOptions,
} from "./toon-codec.js"
export {
  validateEcpDocument,
  validationToDiagnostics,
  TOON_VALIDATED_ECP_SCHEMAS,
  environmentManifestSchema,
  environmentDescribeSchema,
  environmentSearchSchema,
  type ToonValidatedEcpSchema,
} from "./validate-document.js"
export { getEcpSchema } from "./schema.js"

/** Register TOON format extension on the registry. @category Extensions */
export async function registerFormatToonExtension(
  registry = globalRegistry
): Promise<void> {
  if (!registry.getExtension("@executioncontrolprotocol/format-toon")) {
    await registry.registerExtension(formatToonExtension)
  }
}

export default formatToonExtension
