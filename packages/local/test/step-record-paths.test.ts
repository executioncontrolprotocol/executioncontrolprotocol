import { describe, expect, it } from "vitest"
import path from "node:path"
import { HomePaths, stepRecordFileName } from "../src/storage/paths.js"

describe("stepRecordFileName", () => {
  it("names the partial file under for-each", () => {
    const paths = new HomePaths("/ecp-home")
    expect(paths.runForEachPartial("run-1", "items")).toBe(
      path.join("/ecp-home", "runs", "run-1", "for-each", "items.json"),
    )
  })

  it("builds loop, item, and combined names", () => {
    expect(stepRecordFileName("step")).toBe("step.json")
    expect(stepRecordFileName("step", 2)).toBe("step#2.json")
    expect(stepRecordFileName("step", null, [2, 4])).toBe("step#i2.4.json")
    expect(stepRecordFileName("step", 1, [2])).toBe("step#i2#1.json")
  })
})