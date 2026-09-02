import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  isAbsolutePackPath,
  parsePackTarballLine,
  resolvePackTarballPath,
} from "./resolve-pack-tarball.mjs"

describe("parsePackTarballLine", () => {
  it("returns the last .tgz line from verbose pnpm pack output", () => {
    const output = [
      "📦  @executioncontrolprotocol/types@0.13.1",
      "Tarball Contents",
      "package.json",
      "Tarball Details",
      "tmp/ecp-consumer-cli-abc/packs/executioncontrolprotocol-types-0.13.1.tgz",
    ].join("\n")

    expect(parsePackTarballLine(output)).toBe(
      "tmp/ecp-consumer-cli-abc/packs/executioncontrolprotocol-types-0.13.1.tgz",
    )
  })

  it("returns the final line when no .tgz suffix is present", () => {
    expect(parsePackTarballLine("line1\nexecutioncontrolprotocol-types-0.13.1.tgz\n")).toBe(
      "executioncontrolprotocol-types-0.13.1.tgz",
    )
  })
})

describe("resolvePackTarballPath", () => {
  const packsDir = "/tmp/ecp-consumer-cli-abc/packs"

  it("joins a bare filename under packsDir", () => {
    expect(resolvePackTarballPath(packsDir, "executioncontrolprotocol-types-0.13.1.tgz")).toBe(
      join(packsDir, "executioncontrolprotocol-types-0.13.1.tgz"),
    )
  })

  it("uses basename when pnpm prints a relative path (Linux CI)", () => {
    const resolved = resolvePackTarballPath(
      packsDir,
      "tmp/ecp-consumer-cli-abc/packs/executioncontrolprotocol-types-0.13.1.tgz",
    )
    expect(resolved).toBe(join(packsDir, "executioncontrolprotocol-types-0.13.1.tgz"))
    expect(resolved).not.toContain("packs/tmp/")
    expect(resolved).not.toContain("packs\\tmp\\")
  })

  it("preserves a POSIX absolute path", () => {
    const absolute = "/tmp/ecp-consumer-cli/packs/executioncontrolprotocol-types-0.13.1.tgz"
    expect(resolvePackTarballPath(packsDir, absolute)).toBe(absolute)
    expect(isAbsolutePackPath(absolute)).toBe(true)
  })

  it("preserves a Windows absolute path even on POSIX runners", () => {
    const absolute =
      "C:\\Users\\runner\\AppData\\Local\\Temp\\ecp-consumer-cli\\packs\\executioncontrolprotocol-types-0.13.1.tgz"
    expect(resolvePackTarballPath(packsDir, absolute)).toBe(absolute)
    expect(isAbsolutePackPath(absolute)).toBe(true)
  })

  it("throws when the pack output line is empty", () => {
    expect(() => resolvePackTarballPath(packsDir, "   ")).toThrow(
      "pnpm pack produced no tarball path",
    )
  })
})
