import type { Ecp } from "@executioncontrolprotocol/core"
import {
  ECP_INTENT_VALUES,
  type EcpIntent,
  type PendingOfferKind,
} from "@executioncontrolprotocol/types"
import type { PendingOfferAction } from "./chat-run-loop.js"
import {
  resolvePendingOfferAction,
  resolvePendingProbeOfferAction,
} from "./chat-run-loop.js"
import { harnessCapabilityId, type HarnessMode } from "./provider-mode.js"

/** Map a classified intent to a pending-offer host action. @category Demo */
export function pendingOfferActionFromIntent(intent: string | undefined): PendingOfferAction {
  if (intent === ECP_INTENT_VALUES.OFFER_CONFIRM) return "confirm"
  if (intent === ECP_INTENT_VALUES.OFFER_DECLINE) return "decline"
  return "classify"
}

/**
 * Resolve a pending offer via regex fast-path, then harness intent classification.
 * @category Demo
 */
export async function resolvePendingOfferWithIntent(options: {
  ecp: Ecp
  message: string
  kind: PendingOfferKind
  harness: HarnessMode
  providerCapabilityId: string
  model?: string
}): Promise<"confirm" | "decline" | "continue-chat"> {
  const fast =
    options.kind === "probe"
      ? resolvePendingProbeOfferAction(options.message)
      : resolvePendingOfferAction(options.message)
  if (fast === "confirm" || fast === "decline") return fast

  try {
    const invoked = await options.ecp
      .invoke(harnessCapabilityId(options.harness))
      .uses(options.providerCapabilityId)
      .with({
        task: "intent-classification",
        message: options.message,
        pendingOffer: options.kind,
        ...(options.model ? { model: options.model } : {}),
      })
      .process()
    if (!invoked.success || !invoked.result) return "continue-chat"
    const artifact = (invoked.result as { artifact?: EcpIntent }).artifact
    const action = pendingOfferActionFromIntent(artifact?.intent)
    if (action === "confirm" || action === "decline") return action
    return "continue-chat"
  } catch {
    return "continue-chat"
  }
}
