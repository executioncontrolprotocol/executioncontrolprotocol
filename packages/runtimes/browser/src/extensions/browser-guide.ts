import {
  catalogExtension,
  capabilityFor,
  defineExtension,
  globalRegistry,
  type Registry,
} from "@executioncontrolprotocol/core"
import { z } from "zod"

const GuideChatInput = z.object({
  message: z.string(),
})

const GuideChatOutput = z.object({
  text: z.string(),
})

function guideReply(message: string): string {
  const lower = message.toLowerCase()

  if (
    lower.includes("create") &&
    (lower.includes("workflow") || lower.includes("echo") || lower.includes("build"))
  ) {
    return [
      "To generate a workflow in the editor, switch to authoring mode or ask explicitly, for example:",
      '"Create a demo echo workflow."',
      "That will produce Fluent source, a Mermaid graph, and validation results in the panels.",
    ].join(" ")
  }

  if (/what is ecp|execution control protocol/.test(lower)) {
    return [
      "ECP is the Execution Control Protocol: portable workflows run in governed environments",
      "that bind tools, models, policies, and runtimes alongside MCP tool calling.",
    ].join(" ")
  }

  if (/what can you do|what are you|who are you|help me|introduce/.test(lower)) {
    return [
      "I help you build and patch ECP workflows in this editor, explain ECP concepts,",
      "and describe capabilities registered in this environment (for example @executioncontrolprotocol/chrome-ai.generate, @executioncontrolprotocol/fal.generate, and @executioncontrolprotocol/image-sharp.transform).",
      "Ask about workflows, the environment panel, validation, or Chrome AI.",
      'To generate a workflow, try: "Create a demo echo workflow."',
    ].join(" ")
  }

  if (lower.includes("workflow") || lower.includes("fluent") || lower.includes("step")) {
    return [
      "Workflows in ECP are built from steps bound to capabilities.",
      "The left **Workflow** tab shows Fluent API source; edits compile into a manifest.",
      "The right canvas shows a Mermaid graph of the same workflow.",
      "Try: create a demo echo workflow, then open the Code sidebar to explore Fluent, JSON, and TOON.",
    ].join(" ")
  }

  if (lower.includes("environment") || lower.includes("extension") || lower.includes("capabilit")) {
    return [
      "The **Environment** tab lists extensions bound to this session (for example @executioncontrolprotocol/chrome-ai).",
      "Capabilities come from those bindings and appear in describe() output.",
      "The demo binds @executioncontrolprotocol/chrome-ai, @executioncontrolprotocol/fal, and @executioncontrolprotocol/image-sharp for workflow steps (FAL generates images; image-sharp inspects and transforms when running on Node).",
    ].join(" ")
  }

  if (lower.includes("mermaid") || lower.includes("graph") || lower.includes("diagram")) {
    return [
      "The graph panel renders Mermaid from your workflow manifest via @executioncontrolprotocol/format-mermaid.",
      "It updates when you chat-generate a workflow or edit Fluent source.",
    ].join(" ")
  }

  if (lower.includes("valid")) {
    return [
      "Use the **Validation** item in the top bar to see schema and binding diagnostics.",
      "Invalid workflows still appear in the editor so you can fix them.",
    ].join(" ")
  }

  if (lower.includes("run") || lower.includes("execut")) {
    return [
      "Click **Execute** in the top bar to run the current workflow against bound capabilities.",
      "Run output appears in the Run output overlay.",
    ].join(" ")
  }

  if (lower.includes("chrome") || lower.includes("model") || lower.includes("ai")) {
    return [
      "Chrome built-in AI (Gemini Nano) runs on-device after a one-time download.",
      "Choose it in provider settings; a toast shows install progress while you explore.",
      "Until it is ready, I can answer questions in this guided mode using offline help text.",
    ].join(" ")
  }

  return [
    "Welcome to the ECP Graph Editor.",
    "I can explain workflows, the environment, validation, Mermaid graphs, and Chrome AI.",
    "Ask what I can do, what ECP is, or how to run a workflow.",
    'To generate a workflow, say: "Create a demo echo workflow."',
  ].join(" ")
}

/** Browser guided onboarding chat (no external model). @category Extensions */
export const browserGuideExtension = defineExtension("@executioncontrolprotocol", "browser")
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/browser", "guideChat")
      .withInput(GuideChatInput)
      .withOutput(GuideChatOutput)
      .withHandler(async (raw) => {
        const input = raw as z.infer<typeof GuideChatInput>
        return { text: guideReply(input.message) }
      }),
  ])
  .build()

catalogExtension(browserGuideExtension)

/** Register browser guide extension. @category Extensions */
export async function registerBrowserGuideExtension(registry: Registry = globalRegistry): Promise<void> {
  if (!registry.getExtension("@executioncontrolprotocol/browser")) {
    await registry.registerExtension(browserGuideExtension)
  }
}
