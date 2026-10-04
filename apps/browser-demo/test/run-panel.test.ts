import { describe, expect, it } from "vitest"
import type { RunPanelPhase } from "../src/components/RunPanel.js"
import { openUiPanel } from "../src/lib/view-layout.js"

describe("RunPanel phase", () => {
  it("uses input, running, and output phases", () => {
    const phases: RunPanelPhase[] = ["input", "running", "output"]
    expect(phases).toHaveLength(3)
  })
})

describe("openUi from chat expand", () => {
  it("opens ui while keeping chat paired", () => {
    const next = openUiPanel({
      chat: true,
      workflow: false,
      code: false,
      ui: false,
    })
    expect(next.chat).toBe(true)
    expect(next.ui).toBe(true)
    expect(next.workflow).toBe(false)
    expect(next.code).toBe(false)
  })
})
