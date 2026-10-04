import { useCallback, useState } from "react"
import type { CapabilityBlobStore } from "@executioncontrolprotocol/core"
import type { AssistantMode } from "../lib/provider-mode.js"
import type { ChatMessage } from "../types/workspace.js"

let messageCounter = 0

function nextId(): string {
  messageCounter += 1
  return `msg-${messageCounter}`
}

const GUIDED_WELCOME =
  "Welcome to the ECP Graph Editor. I can build workflows, answer ECP questions, and explain what is registered in this environment. Try: What is ECP? or pick a Chrome AI quickstart below."

const AUTHORING_WELCOME =
  "Describe a workflow to create or patch, or pick a Chrome AI quickstart below."

/** Options when appending an agent chat message. */
export interface AppendAgentOptions {
  variant?: "normal" | "error"
  offerRun?: boolean
  offerProbe?: boolean
  runForm?: boolean
  runOutput?: boolean
  /** Snapshot of run output for this bubble (frozen). */
  runOutputData?: unknown
  /** Snapshot of run blobs for this bubble (frozen). */
  runBlobs?: CapabilityBlobStore
}

/** Build an agent chat message (pure; used by {@link useChatHistory} and tests). */
export function buildAgentChatMessage(
  text: string,
  options?: AppendAgentOptions,
  id: string = nextId()
): ChatMessage {
  return {
    id,
    role: "agent",
    text,
    variant: options?.variant ?? "normal",
    ...(options?.offerRun ? { offerRun: true } : {}),
    ...(options?.offerProbe ? { offerProbe: true } : {}),
    ...(options?.runForm ? { runForm: true } : {}),
    ...(options?.runOutput
      ? {
          runOutput: true,
          ...(options.runOutputData !== undefined
            ? { runOutputData: options.runOutputData }
            : {}),
          ...(options.runBlobs ? { runBlobs: options.runBlobs } : {}),
        }
      : {}),
  }
}

/** Chat history and status helpers. */
export function useChatHistory(initialMode: AssistantMode = "authoring") {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: nextId(),
      role: "agent",
      text: initialMode === "guided" ? GUIDED_WELCOME : AUTHORING_WELCOME,
    },
  ])
  const [status, setStatus] = useState("Ready")

  const appendUser = useCallback((text: string) => {
    setMessages((prev) => [...prev, { id: nextId(), role: "user", text }])
  }, [])

  const appendAgent = useCallback((text: string, options?: AppendAgentOptions) => {
    setMessages((prev) => [...prev, buildAgentChatMessage(text, options)])
  }, [])

  const appendAgentError = useCallback((text: string) => {
    setMessages((prev) => [...prev, { id: nextId(), role: "agent", text, variant: "error" }])
  }, [])

  const clearOfferRunFlags = useCallback(() => {
    setMessages((prev) =>
      prev.map((m) => (m.offerRun ? { ...m, offerRun: false } : m))
    )
  }, [])

  const clearOfferProbeFlags = useCallback(() => {
    setMessages((prev) =>
      prev.map((m) => (m.offerProbe ? { ...m, offerProbe: false } : m))
    )
  }, [])

  const setGuidedWelcome = useCallback(() => {
    setMessages([{ id: nextId(), role: "agent", text: GUIDED_WELCOME }])
  }, [])

  const resetWelcome = useCallback((mode: AssistantMode = "authoring") => {
    setMessages([
      {
        id: nextId(),
        role: "agent",
        text: mode === "guided" ? GUIDED_WELCOME : AUTHORING_WELCOME,
      },
    ])
  }, [])

  return {
    messages,
    status,
    setStatus,
    appendUser,
    appendAgent,
    appendAgentError,
    clearOfferRunFlags,
    clearOfferProbeFlags,
    setGuidedWelcome,
    resetWelcome,
  }
}
