/**
 * Shared chat-turn helpers for `@executioncontrolprotocol/model.generate` providers.
 * @category Harness
 */

/** Prior user/assistant turn from generate input. @category Harness */
export interface ProviderChatPriorMessage {
  /** Turn role. */
  role: "user" | "assistant"
  /** Turn text. */
  content: string
}

/** Options for {@link toProviderChatTurns}. @category Harness */
export interface ToProviderChatTurnsOptions {
  /** Optional system instruction (kept separate from messages). */
  system?: string
  /** Prior turns only (no system). */
  messages?: ProviderChatPriorMessage[]
  /** Current user turn text. */
  prompt: string
  /** Optional context blob appended as an extra system line when stringifying. */
  context?: unknown
}

/** Role/content turn for provider chat APIs. @category Harness */
export interface ProviderChatTurn {
  /** Turn role including system. */
  role: "system" | "user" | "assistant"
  /** Turn text. */
  content: string
}

/**
 * Build provider chat turns from the portable generate contract.
 * System stays first; prior `messages` come next; `prompt` is always the final user turn.
 * @category Harness
 */
export function toProviderChatTurns(options: ToProviderChatTurnsOptions): ProviderChatTurn[] {
  const turns: ProviderChatTurn[] = []
  const system = options.system?.trim()
  if (system) {
    turns.push({ role: "system", content: system })
  }
  if (options.context !== undefined) {
    turns.push({
      role: "system",
      content:
        typeof options.context === "string"
          ? options.context
          : JSON.stringify(options.context),
    })
  }
  for (const message of options.messages ?? []) {
    const content = message.content.trim()
    if (!content) continue
    turns.push({ role: message.role, content: message.content })
  }
  turns.push({ role: "user", content: options.prompt })
  return turns
}

/**
 * Flatten generate turns into a single labeled transcript for providers without turn lists.
 * Prefer {@link toProviderChatTurns} when the provider supports native messages.
 * @category Harness
 */
export function flattenProviderChatTurns(options: ToProviderChatTurnsOptions): string {
  const lines: string[] = []
  for (const turn of toProviderChatTurns(options)) {
    if (turn.role === "system") {
      lines.push(`System: ${turn.content}`)
    } else if (turn.role === "assistant") {
      lines.push(`Assistant: ${turn.content}`)
    } else {
      lines.push(`User: ${turn.content}`)
    }
  }
  return lines.join("\n\n")
}
