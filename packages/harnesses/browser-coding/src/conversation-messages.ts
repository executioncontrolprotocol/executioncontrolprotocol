import { z } from "zod"

/** Portable prior turn for coding harness generate calls. @category Harness */
export const codingConversationMessageSchema = z.object({
  /** Turn role (system stays on generate.system). */
  role: z.enum(["user", "assistant"]),
  /** Turn text. */
  content: z.string(),
})

/** Prior conversation turn type. @category Harness */
export type CodingConversationMessage = z.infer<typeof codingConversationMessageSchema>

/**
 * Normalize host-supplied conversation turns (drop empties, keep order).
 * @category Harness
 */
export function normalizeCodingConversationMessages(
  messages: CodingConversationMessage[] | undefined
): CodingConversationMessage[] {
  if (!messages?.length) return []
  return messages
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter((message) => message.content.length > 0)
}

/**
 * Build generate `messages` for a repair attempt: prior chat + original user turn + failed assistant output.
 * @category Harness
 */
export function buildCodingRepairGenerateMessages(options: {
  conversationMessages?: CodingConversationMessage[]
  originalUserPrompt: string
  priorRaw: string
}): CodingConversationMessage[] {
  const prior = normalizeCodingConversationMessages(options.conversationMessages)
  const priorRaw = options.priorRaw.trim()
  return [
    ...prior,
    { role: "user", content: options.originalUserPrompt },
    ...(priorRaw.length > 0 ? [{ role: "assistant" as const, content: priorRaw }] : []),
  ]
}

/**
 * Extract the previous user message from a conversation for thin intent routing.
 * @category Harness
 */
export function previousUserMessageFromConversation(
  messages: CodingConversationMessage[] | undefined
): string | undefined {
  const prior = normalizeCodingConversationMessages(messages)
  for (let i = prior.length - 1; i >= 0; i--) {
    if (prior[i]?.role === "user") {
      return prior[i]?.content
    }
  }
  return undefined
}
