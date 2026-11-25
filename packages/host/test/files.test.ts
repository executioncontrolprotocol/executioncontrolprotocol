import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { FILE_MAX_BYTES, listExecutionFiles, readAllowedFile, writeAllowedExecutionFile } from "../src/http/files.js"

describe("host file helpers", () => {
  let root: string

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
  })

  it("lists execution files under a directory", () => {
    root = mkdtempSync(path.join(os.tmpdir(), "ecp-host-files-"))
    writeFileSync(path.join(root, "a.ecp.json"), "{}")
    mkdirSync(path.join(root, "nested"))
    writeFileSync(path.join(root, "nested", "b.ecp.json"), "{}")
    writeFileSync(path.join(root, "skip.txt"), "x")
    expect(listExecutionFiles(root).sort()).toEqual(
      [path.join(root, "a.ecp.json"), path.join(root, "nested", "b.ecp.json")].sort(),
    )
  })

  it("reads and writes watched execution files", async () => {
    root = mkdtempSync(path.join(os.tmpdir(), "ecp-host-files-"))
    const file = path.join(root, "demo.ecp.json")
    writeFileSync(file, '{"schema":"x"}\n')
    const watched = new Set([path.resolve(file)])

    expect(readAllowedFile(file)).toEqual({ ok: true, text: '{"schema":"x"}\n' })

    const ok = await writeAllowedExecutionFile(file, '{"schema":"y"}\n', watched)
    expect(ok).toEqual({ ok: true })
    expect(readFileSync(file, "utf8")).toBe('{"schema":"y"}\n')

    expect(await writeAllowedExecutionFile("relative.ecp.json", "{}", watched)).toMatchObject({
      ok: false,
      code: "ECP_REQUEST_INVALID",
    })
    expect(await writeAllowedExecutionFile(path.join(root, "other.txt"), "{}", watched)).toMatchObject({
      ok: false,
    })
    const missing = path.join(root, "missing.ecp.json")
    const watchMissing = new Set([path.resolve(missing)])
    expect(await writeAllowedExecutionFile(missing, "{}", watchMissing)).toMatchObject({
      ok: false,
      code: "ECP_NOT_FOUND",
    })
    expect(await writeAllowedExecutionFile(file, "x".repeat(FILE_MAX_BYTES + 1), watched)).toMatchObject({
      ok: false,
      code: "ECP_REQUEST_INVALID",
    })
    expect(await writeAllowedExecutionFile(file, "{}", new Set())).toMatchObject({
      ok: false,
      message: expect.stringContaining("not open"),
    })
  })
})