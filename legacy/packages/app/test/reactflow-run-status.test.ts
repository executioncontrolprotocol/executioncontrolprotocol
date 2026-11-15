import { describe, expect, it } from "vitest"
import {
  armRunState,
  edgeRunStatus,
  markPendingAsSkipped,
  resetStepStatuses,
  stepNodeStatusClass,
} from "../src/ui/lib/reactflow-run-status.js"

describe("reactflow-run-status skipped", () => {
  it("marks pending steps as skipped after a run", () => {
    const statuses = resetStepStatuses(["a", "b", "c"])
    statuses.a = "completed"
    statuses.b = "running"
    const next = markPendingAsSkipped(statuses)
    expect(next).toEqual({
      a: "completed",
      b: "running",
      c: "skipped",
    })
  })

  it("does not mark skipped mid-run when statuses stay pending", () => {
    const pending = resetStepStatuses(["a", "b"])
    expect(pending.a).toBe("pending")
    expect(stepNodeStatusClass("pending", true)).toBe("ecp-rf-node--pending")
    expect(stepNodeStatusClass("pending", false)).toBe("")
    expect(markPendingAsSkipped(pending, ["a"])).toEqual({
      a: "skipped",
      b: "pending",
    })
  })

  it("keeps edges idle when the target was skipped", () => {
    expect(edgeRunStatus("completed", "skipped", false)).toBe("idle")
    expect(edgeRunStatus("pending", "skipped", true)).toBe("idle")
    expect(stepNodeStatusClass("skipped", false)).toBe("ecp-rf-node--skipped")
  })

  it("derives arm taken vs skipped from child step statuses", () => {
    const statuses = {
      yes: "completed" as const,
      no: "skipped" as const,
    }
    expect(armRunState(["yes"], statuses)).toBe("taken")
    expect(armRunState(["no"], statuses)).toBe("skipped")
    expect(armRunState(["yes", "no"], { yes: "pending", no: "pending" })).toBe("idle")
  })
})
