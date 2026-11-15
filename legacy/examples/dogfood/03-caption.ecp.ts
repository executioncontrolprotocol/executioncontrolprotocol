import { workflow, step, extension } from "@executioncontrolprotocol/core"

/** Dogfood A task 3: caption with Ollama (Mermaid encode is a CLI format-plugin step). */
export default workflow("dogfood-caption")
  .with([extension("@executioncontrolprotocol/ollama")])
  .run([
    step("@executioncontrolprotocol/ollama.generate", "Caption")
      .with({
        prompt: "Write a one-sentence product caption for a 64px thumbnail of a widget.",
        model: "llama3.2",
      })
      .as("caption"),
  ])
