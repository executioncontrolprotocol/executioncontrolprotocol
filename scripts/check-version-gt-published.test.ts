import { describe, expect, it } from "vitest"
import { checkWorkspaceVersionsVsNpm } from "./check-version-gt-published.mjs"

const core = { name: "@executioncontrolprotocol/core", version: "0.51.0" }
const cli = { name: "@executioncontrolprotocol/cli", version: "0.51.0" }

describe("checkWorkspaceVersionsVsNpm", () => {
  it("passes when nothing is published yet", () => {
    const result = checkWorkspaceVersionsVsNpm([core, cli], () => null)
    expect(result.ok).toBe(true)
    expect(result.lines.some((line) => line.includes("not on npm yet"))).toBe(true)
  })

  it("passes when every local version is greater than npm", () => {
    const result = checkWorkspaceVersionsVsNpm([core, cli], () => "0.50.0")
    expect(result.ok).toBe(true)
    expect(result.lines.every((line) => line.startsWith("OK"))).toBe(true)
  })

  it("fails when a local version equals npm latest", () => {
    const result = checkWorkspaceVersionsVsNpm([core], () => "0.51.0")
    expect(result.ok).toBe(false)
    expect(result.lines[0]).toMatch(/must be greater than npm latest/)
  })

  it("fails when a local version is behind npm latest", () => {
    const result = checkWorkspaceVersionsVsNpm(
      [{ name: "@executioncontrolprotocol/cli", version: "0.49.0" }],
      () => "0.50.0"
    )
    expect(result.ok).toBe(false)
  })

  it("fails when a local version is not valid semver", () => {
    const result = checkWorkspaceVersionsVsNpm(
      [{ name: "@executioncontrolprotocol/cli", version: "next" }],
      () => "0.50.0"
    )
    expect(result.ok).toBe(false)
  })

  it("fails when there are no publishable packages", () => {
    const result = checkWorkspaceVersionsVsNpm([])
    expect(result.ok).toBe(false)
    expect(result.lines[0]).toMatch(/No publishable/)
  })
})
