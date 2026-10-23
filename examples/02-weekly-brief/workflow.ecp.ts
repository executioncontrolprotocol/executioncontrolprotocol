import { workflow, step, ref, extension, secrets } from "@executioncontrolprotocol/core"

export default workflow("Weekly leadership brief")
  .with([
    extension("@executioncontrolprotocol/openai").with({
      apiKey: secrets("openai/api-key", { optional: true }),
      defaultModel: "gpt-4o-mini",
    }),
  ])
  .accepts({
    type: "object",
    properties: {
      signals: { type: "array" },
    },
    required: ["signals"],
  })
  .run([
    step("@executioncontrolprotocol/openai.generate", "Generate Executive Brief")
      .with({
        prompt: "Create a concise leadership brief.",
        context: ref("input.signals"),
      })
      .as("brief"),
  ])
