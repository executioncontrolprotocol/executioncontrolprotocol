import { describe, expect, it } from "vitest"
import {
  activeViewCount,
  columnWidthClass,
  DEFAULT_VIEW_STATE,
  ensureWorkflowVisibleState,
  isPairedLayout,
  isWorkspaceVisible,
  openUiPanel,
  toggleViewPanel,
  viewStateOpenAuthoringWorkspace,
} from "../src/lib/view-layout.js"

describe("view-layout", () => {
  it("defaults to chat-only full width", () => {
    expect(DEFAULT_VIEW_STATE).toEqual({
      chat: true,
      workflow: false,
      code: false,
      ui: false,
    })
    expect(isWorkspaceVisible(DEFAULT_VIEW_STATE)).toBe(false)
    expect(isPairedLayout(DEFAULT_VIEW_STATE)).toBe(false)
    expect(columnWidthClass(false)).toBe("is-full")
  })

  it("prevents deactivating the last active panel", () => {
    const next = toggleViewPanel(DEFAULT_VIEW_STATE, "chat")
    expect(next).toEqual(DEFAULT_VIEW_STATE)
  })

  it("activates workflow and deactivates code and ui", () => {
    const withCode = { chat: true, workflow: false, code: true, ui: false }
    const next = toggleViewPanel(withCode, "workflow")
    expect(next).toEqual({ chat: true, workflow: true, code: false, ui: false })
  })

  it("activates code and deactivates workflow and ui", () => {
    const withWorkflow = { chat: true, workflow: true, code: false, ui: false }
    const next = toggleViewPanel(withWorkflow, "code")
    expect(next).toEqual({ chat: true, workflow: false, code: true, ui: false })
  })

  it("activates ui and deactivates workflow and code", () => {
    const withWorkflow = { chat: true, workflow: true, code: false, ui: false }
    const next = toggleViewPanel(withWorkflow, "ui")
    expect(next).toEqual({ chat: true, workflow: false, code: false, ui: true })
  })

  it("deactivates workflow when more than one panel is active", () => {
    const state = { chat: true, workflow: true, code: false, ui: false }
    const next = toggleViewPanel(state, "workflow")
    expect(next).toEqual({ chat: true, workflow: false, code: false, ui: false })
  })

  it("detects paired layout when chat and ui are both active", () => {
    const state = { chat: true, workflow: false, code: false, ui: true }
    expect(isPairedLayout(state)).toBe(true)
    expect(isWorkspaceVisible(state)).toBe(true)
    expect(columnWidthClass(true)).toBe("is-half")
    expect(activeViewCount(state)).toBe(2)
  })

  it("openUiPanel clears authoring workspace panels", () => {
    const next = openUiPanel({
      chat: true,
      workflow: true,
      code: false,
      ui: false,
    })
    expect(next).toEqual({ chat: true, workflow: false, code: false, ui: true })
  })

  it("viewStateOpenAuthoringWorkspace opens workflow when authoring panels are hidden", () => {
    expect(viewStateOpenAuthoringWorkspace(DEFAULT_VIEW_STATE)).toEqual({
      chat: true,
      workflow: true,
      code: false,
      ui: false,
    })
    const alreadyUi = { chat: true, workflow: false, code: false, ui: true }
    expect(viewStateOpenAuthoringWorkspace(alreadyUi)).toEqual({
      chat: true,
      workflow: true,
      code: false,
      ui: false,
    })
    const alreadyCode = { chat: true, workflow: false, code: true, ui: false }
    expect(viewStateOpenAuthoringWorkspace(alreadyCode)).toEqual(alreadyCode)
  })

  it("ensureWorkflowVisibleState clears ui and code", () => {
    expect(
      ensureWorkflowVisibleState({
        chat: true,
        workflow: false,
        code: false,
        ui: true,
      })
    ).toEqual({ chat: true, workflow: true, code: false, ui: false })
  })
})
