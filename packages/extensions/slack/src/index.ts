import { defineExtension, capabilityFor, globalRegistry, catalogExtension } from "@executioncontrolprotocol/core"
import { z } from "zod"

/** @executioncontrolprotocol/slack extension (mock send for v1). @category Extensions */
export const slackExtension = defineExtension("@executioncontrolprotocol", "slack")
  .withConfig({
    botToken: z.string().optional(),
    defaultChannel: z.string().optional(),
  })
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/slack", "send")
      .withInput(z.object({ message: z.unknown(), channel: z.string().optional() }))
      .withOutput(z.object({ ok: z.boolean(), ts: z.string().optional() }))
      .withHandler(async () => ({
        ok: true,
        ts: `mock-${Date.now()}`,
      })),
  ])
  .build()

catalogExtension(slackExtension)

export async function registerSlackExtension(): Promise<void> {
  if (!globalRegistry.getExtension("@executioncontrolprotocol/slack")) {
    await globalRegistry.registerExtension(slackExtension)
  }
}

export default slackExtension
