import { z } from "zod"
import { defineOperation, getHost } from "@executioncontrolprotocol/plugin-sdk"
import { writeGlobalCapabilityTypes } from "../lib/capability-types.js"

/** `ecp workflows types`. @category CLI */
export const typesOperation = defineOperation("workflows:types")
  .withInput(z.object({}))
  .withMetadata({
    summary: "Refresh global editor capability types",
    description:
      "Write ~/.ecp/cache/types/capabilities.d.ts from installed plugins and recreate the core junction. Run after plugins link, unlink, update, or uninstall.",
    useCases: ["Refresh editor types after changing plugins"],
    examples: ["ecp workflows types"],
  })
  .withHandler(async () => {
    const host = getHost()
    return writeGlobalCapabilityTypes({ registry: host.registry })
  })
  .build()
