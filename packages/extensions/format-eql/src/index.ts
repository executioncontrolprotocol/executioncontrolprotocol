import { catalogExtension, globalRegistry, type Registry } from "@executioncontrolprotocol/core"
import { formatEqlExtension } from "./extension.js"

catalogExtension(formatEqlExtension)

export { formatEqlExtension } from "./extension.js"
export { encodeToEql } from "./encode/encode-eql.js"
export { decodeFromEql } from "./decode/decode-eql.js"
export type { EqlFormatOptions, EqlEncodeInput, EqlDecodeInput } from "./schemas.js"
export { encodeWorkflowToEql } from "./encode/encode-workflow.js"
export { encodePatchToEql } from "./encode/encode-patch.js"
export { encodeEnvironmentToEql } from "./encode/encode-environment.js"
export { encodeDescribeToEql } from "./encode/encode-describe.js"

/** Register `@executioncontrolprotocol/format-eql` in the global or provided registry. @category Extensions */
export async function registerFormatEqlExtension(
  registry: Registry = globalRegistry
): Promise<void> {
  if (!registry.getExtension("@executioncontrolprotocol/format-eql")) {
    await registry.registerExtension(formatEqlExtension)
  }
}
