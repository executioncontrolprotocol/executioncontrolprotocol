import { describe, expect, it } from "vitest"
import { resolveHostIoActions } from "../src/lib/top-app-bar-actions.js"

describe("resolveHostIoActions", () => {
  it("enables open and save when connected with a workflow", () => {
    expect(
      resolveHostIoActions({ hostConnected: true, hasWorkflow: true })
    ).toEqual({ canOpen: true, canSave: true })
  })

  it("disables open and save when disconnected", () => {
    expect(
      resolveHostIoActions({ hostConnected: false, hasWorkflow: true })
    ).toEqual({ canOpen: false, canSave: false })
  })

  it("allows open without a workflow but not save", () => {
    expect(
      resolveHostIoActions({ hostConnected: true, hasWorkflow: false })
    ).toEqual({ canOpen: true, canSave: false })
  })

  it("disables save while busy", () => {
    expect(
      resolveHostIoActions({
        hostConnected: true,
        hasWorkflow: true,
        saveBusy: true,
      })
    ).toEqual({ canOpen: true, canSave: false })
  })
})
