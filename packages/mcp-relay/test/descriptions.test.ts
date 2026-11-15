import { describe, expect, it } from "vitest"
import {
  COMMIT_DESCRIPTION,
  EXECUTE_DESCRIPTION,
  RETRIEVE_DESCRIPTION,
} from "../src/descriptions.js"

describe("tool descriptions", () => {
  it("matches the Phase 6 snapshot", () => {
    expect({
      retrieve: RETRIEVE_DESCRIPTION,
      execute: EXECUTE_DESCRIPTION,
      commit: COMMIT_DESCRIPTION,
    }).toMatchSnapshot()
  })

  it("mentions the fix loop and secrets boundary", () => {
    expect(EXECUTE_DESCRIPTION).toMatch(/validate/)
    expect(EXECUTE_DESCRIPTION).toMatch(/ecp secrets set/)
    expect(RETRIEVE_DESCRIPTION).toMatch(/accepts\/returns/)
    expect(COMMIT_DESCRIPTION).toMatch(/ifVersion|updates/i)
  })
})
