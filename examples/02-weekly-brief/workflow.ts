import { workflow, step, ref } from "@executioncontrolprotocol/core"

export default workflow("Weekly leadership brief")
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
