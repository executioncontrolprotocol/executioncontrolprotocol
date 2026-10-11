import type { ChatMessage } from "../types/workspace.js"

/** Max prior turns (user+assistant) sent to the coding harness generate call. */
export const DEMO_CHAT_HISTORY_MAX_TURNS = 12

/** Max characters per assistant/user turn forwarded to the model. */
export const DEMO_CHAT_HISTORY_MAX_CHARS = 1200

/** Prior generate turn for harness chat input. */
export interface DemoConversationMessage {
  role: "user" | "assistant"
  content: string
}

/**
 * Truncate a conversation turn for model context.
 * @category Demo
 */
export function truncateConversationContent(
  content: string,
  maxChars: number = DEMO_CHAT_HISTORY_MAX_CHARS
): string {
  const trimmed = content.trim()
  if (trimmed.length <= maxChars) return trimmed
  const suffix = "…[truncated for model context]"
  return `${trimmed.slice(0, Math.max(0, maxChars - suffix.length))}${suffix}`
}

/**
 * Map UI chat history to portable generate prior turns.
 * Skips welcome / empty messages. Does not include the current user request
 * (passed separately as `message`) — call before React has flushed appendUser.
 */
export function buildDemoConversationMessages(
  messages: ChatMessage[],
  maxTurns: number = DEMO_CHAT_HISTORY_MAX_TURNS
): DemoConversationMessage[] {
  const turns: DemoConversationMessage[] = []
  for (const message of messages) {
    const content = message.text.trim()
    if (!content) continue
    if (message.role === "agent" && message.variant === "error") continue
    if (message.role === "user") {
      turns.push({ role: "user", content: truncateConversationContent(content) })
    } else if (message.role === "agent") {
      turns.push({
        role: "assistant",
        content: truncateConversationContent(content),
      })
    }
  }
  if (turns.length <= maxTurns) return turns
  return turns.slice(-maxTurns)
}
