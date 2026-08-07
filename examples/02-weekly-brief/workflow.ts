import { workflow, step, ref } from "@executioncontrolprotocol/core"

export default workflow("Weekly leadership brief")
  .run([
    step("@executioncontrolprotocol/memory.search", "Collect Weekly Signals")
      .with({ query: "important risks and decisions this week", since: "7d" })
      .as("signals"),

    step("@executioncontrolprotocol/openai.generate", "Generate Executive Brief")
      .with({
        prompt: "Create a concise leadership brief.",
        context: ref("signals.results"),
      })
      .as("brief"),

    step("@executioncontrolprotocol/slack.send", "Send Brief to Slack")
      .with({ message: ref("brief.content") }),
  ])
