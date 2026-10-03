import { defineExtension, capabilityFor, globalRegistry, catalogExtension, NODE_RUNTIME_ID } from "@executioncontrolprotocol/core"
import { z } from "zod"

/** @executioncontrolprotocol/slack extension (mock send for v1). @category Extensions */
export const slackExtension = defineExtension("@executioncontrolprotocol", "slack")
  .withSupportedRuntimes([NODE_RUNTIME_ID])
  .withMetadata({
    summary: "Send messages to Slack channels",
    description:
      "Posts workflow notifications or alerts to Slack. v1 uses a mock send handler suitable for development and testing before live bot token integration.",
    useCases: [
      "Notify a team channel when a workflow completes",
      "Send status updates from automated runs",
    ],
    samplePrompts: [
      "Post this message to the engineering Slack channel",
      "Send a Slack notification that the job finished",
    ],
  })
  .withConfig({
    botToken: z.string().optional(),
    defaultChannel: z.string().optional(),
  })
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/slack", "send")
      .withInput(z.object({ message: z.unknown(), channel: z.string().optional() }))
      .withOutput(z.object({ ok: z.boolean(), ts: z.string().optional() }))
      .withMetadata({
        summary: "Send a message to a Slack channel",
        description:
          "Delivers a message payload to the configured or requested Slack channel and returns whether the post succeeded along with an optional timestamp id.",
        useCases: [
          "Alert operators when a step fails or needs approval",
          "Share summarized workflow output in a team channel",
        ],
        samplePrompts: [
          "Send this summary to #releases on Slack",
          "Notify Slack that deployment completed successfully",
        ],
      })
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
