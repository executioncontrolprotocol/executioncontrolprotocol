import { describe, expect, it } from "vitest"
import { ECP_INTENT_VALUES } from "@executioncontrolprotocol/types"
import {
  pendingOfferActionFromIntent,
  resolvePendingOfferWithIntent,
} from "../src/lib/classify-pending-offer.js"

describe("pendingOfferActionFromIntent", () => {
  it("maps offer-confirm and offer-decline", () => {
    expect(pendingOfferActionFromIntent(ECP_INTENT_VALUES.OFFER_CONFIRM)).toBe("confirm")
    expect(pendingOfferActionFromIntent(ECP_INTENT_VALUES.OFFER_DECLINE)).toBe("decline")
    expect(pendingOfferActionFromIntent(ECP_INTENT_VALUES.WORKFLOW_PATCH)).toBe("classify")
    expect(pendingOfferActionFromIntent(undefined)).toBe("classify")
  })
})

describe("resolvePendingOfferWithIntent", () => {
  it("confirms via regex fast path without invoking the harness", async () => {
    let invoked = false
    const ecp = {
      invoke: () => {
        invoked = true
        return {
          uses: () => ({
            with: () => ({
              process: async () => ({ success: false }),
            }),
          }),
        }
      },
    }
    const decision = await resolvePendingOfferWithIntent({
      ecp: ecp as never,
      message: "yes",
      kind: "probe",
      harness: "nano",
      providerCapabilityId: "@executioncontrolprotocol/chrome-ai",
    })
    expect(decision).toBe("confirm")
    expect(invoked).toBe(false)
  })

  it("declines via regex fast path", async () => {
    const decision = await resolvePendingOfferWithIntent({
      ecp: { invoke: () => ({ uses: () => ({ with: () => ({ process: async () => ({}) }) }) }) } as never,
      message: "not now",
      kind: "run",
      harness: "coding",
      providerCapabilityId: "@executioncontrolprotocol/ollama",
    })
    expect(decision).toBe("decline")
  })

  it("maps classified offer-confirm from harness intent", async () => {
    const decision = await resolvePendingOfferWithIntent({
      ecp: {
        invoke: () => ({
          uses: () => ({
            with: () => ({
              process: async () => ({
                success: true,
                result: {
                  artifact: {
                    schema: "@executioncontrolprotocol.intent",
                    intent: "offer-confirm",
                    topic: "probe",
                  },
                },
              }),
            }),
          }),
        }),
      } as never,
      message: "Yes, inspect it",
      kind: "probe",
      harness: "nano",
      providerCapabilityId: "@executioncontrolprotocol/chrome-ai",
    })
    expect(decision).toBe("confirm")
  })

  it("continues chat when classified intent is not confirm/decline", async () => {
    const decision = await resolvePendingOfferWithIntent({
      ecp: {
        invoke: () => ({
          uses: () => ({
            with: () => ({
              process: async () => ({
                success: true,
                result: {
                  artifact: {
                    schema: "@executioncontrolprotocol.intent",
                    intent: "workflow-patch",
                  },
                },
              }),
            }),
          }),
        }),
      } as never,
      message: "actually change the width first",
      kind: "run",
      harness: "coding",
      providerCapabilityId: "@executioncontrolprotocol/ollama",
    })
    expect(decision).toBe("continue-chat")
  })
})
