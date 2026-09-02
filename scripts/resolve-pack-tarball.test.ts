import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  isAbsolutePackPath,
  parsePackTarballLine,
  resolvePackTarballPath,
} from "./resolve-pack-tarball.mjs"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const typesVersion = JSON.parse(
  readFileSync(join(repoRoot, "packages/types/package.json"), "utf8"),
).version as string
const typesTarball = `executioncontrolprotocol-types-${typesVersion}.tgz`

describe("parsePackTarballLine", () => {
  it("returns the last .tgz line from verbose pnpm pack output", () => {
    const tarballPath = `tmp/ecp-consumer-cli-abc/packs/${typesTarball}`
    const output = [
      `📦  @executioncontrolprotocol/types@${typesVersion}`,
      "Tarball Contents",
      "package.json",
      "Tarball Details",
      tarballPath,
    ].join("\n")

    expect(parsePackTarballLine(output)).toBe(tarballPath)
  })

  it("returns the final line when no .tgz suffix is present", () => {
    expect(parsePackTarballLine(`line1\n${typesTarball}\n`)).toBe(typesTarball)
  })
})

describe("resolvePackTarballPath", () => {
  const packsDir = "/tmp/ecp-consumer-cli-abc/packs"

  it("joins a bare filename under packsDir", () => {
    expect(resolvePackTarballPath(packsDir, typesTarball)).toBe(join(packsDir, typesTarball))
  })

  it("uses basename when pnpm prints a relative path (Linux CI)", () => {
    const resolved = resolvePackTarballPath(
      packsDir,
      `tmp/ecp-consumer-cli-abc/packs/${typesTarball}`,
    )
    expect(resolved).toBe(join(packsDir, typesTarball))
    expect(resolved).not.toContain("packs/tmp/")
    expect(resolved).not.toContain("packs\\tmp\\")
  })

  it("preserves a POSIX absolute path", () => {
    const absolute = `/tmp/ecp-consumer-cli/packs/${typesTarball}`
    expect(resolvePackTarballPath(packsDir, absolute)).toBe(absolute)
    expect(isAbsolutePackPath(absolute)).toBe(true)
  })

  it("preserves a Windows absolute path even on POSIX runners", () => {
    const absolute = `C:\\Users\\runner\\AppData\\Local\\Temp\\ecp-consumer-cli\\packs\\${typesTarball}`
    expect(resolvePackTarballPath(packsDir, absolute)).toBe(absolute)
    expect(isAbsolutePackPath(absolute)).toBe(true)
  })

  it("throws when the pack output line is empty", () => {
    expect(() => resolvePackTarballPath(packsDir, "   ")).toThrow(
      "pnpm pack produced no tarball path",
    )
  })
})
