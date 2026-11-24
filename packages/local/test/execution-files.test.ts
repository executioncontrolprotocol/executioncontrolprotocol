import { readFileSync, writeFileSync, mkdtempSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import {
  executionPathVersion,
  LocalExecutionFiles,
  manifestExecutionText,
  resolveScriptKey,
  listExecutionFilePaths,
  SCRIPTS_MAP_MAX_BYTES,
} from "../src/storage/execution-files.js"
import { StorageError } from "../src/storage/errors.js"

const echo: ExecutionManifest = {
  schema: "@executioncontrolprotocol.execution",
  version: "2.0",
  execution: { id: "echo", label: "Echo" },
  steps: [{ id: "echo", uses: "@executioncontrolprotocol/test.echo", input: { value: "hi" }, as: "echo" }],
}

describe("execution-files", () => {
  const files = new LocalExecutionFiles()

  it("includes missing script paths in the version digest", async () => {
    const text = manifestExecutionText(echo)
    const vMissing = await executionPathVersion(text, [{ path: "gone.js", text: "", missing: true }])
    const vPresent = await executionPathVersion(text, [{ path: "gone.js", text: "ok", missing: false }])
    expect(vMissing).not.toBe(vPresent)
  })

  it("version is stable for unchanged bytes", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ecp-ver-"))
    const execPath = path.join(dir, "a.ecp.json")
    writeFileSync(execPath, manifestExecutionText(echo))
    const one = await files.stat(execPath)
    const two = await files.stat(execPath)
    expect(one.version).toBe(two.version)
  })

  it("readScripts returns transform script.path", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ecp-transform-script-"))
    const scriptPath = path.join(dir, "map.js")
    writeFileSync(scriptPath, "export default (v) => v\n")
    const manifest: ExecutionManifest = {
      ...echo,
      steps: [
        {
          id: "map",
          uses: "@executioncontrolprotocol/core.transform",
          script: { path: "map.js", lang: "js" },
          input: { value: { $ref: "state.x" } },
          as: "map",
        },
      ],
    }
    const execPath = path.join(dir, "flow.ecp.json")
    writeFileSync(execPath, manifestExecutionText(manifest))
    const scripts = await files.readScripts(dir, manifest)
    expect(scripts["map.js"]).toContain("export default")
    const before = await files.stat(execPath)
    writeFileSync(scriptPath, "export default (v) => ({ ...v })\n")
    const after = await files.stat(execPath)
    expect(after.version).not.toBe(before.version)
  })

  it("version changes when a referenced script changes", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ecp-script-"))
    const scriptPath = path.join(dir, "helper.js")
    writeFileSync(scriptPath, "export const x = 1\n")
    const manifest: ExecutionManifest = {
      ...echo,
      steps: [
        {
          id: "run",
          uses: "@executioncontrolprotocol/test.echo",
          input: { value: { $script: { path: "helper.js", lang: "javascript", params: {} } } },
          as: "run",
        },
      ],
    }
    const execPath = path.join(dir, "flow.ecp.json")
    writeFileSync(execPath, manifestExecutionText(manifest))
    const before = await files.stat(execPath)
    writeFileSync(scriptPath, "export const x = 2\n")
    const after = await files.stat(execPath)
    expect(after.version).not.toBe(before.version)
  })

  it("writes atomically with version conflict", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ecp-write-"))
    const execPath = path.join(dir, "a.ecp.json")
    writeFileSync(execPath, manifestExecutionText(echo))
    const { version } = await files.stat(execPath)
    const next = await files.write(execPath, manifestExecutionText({ ...echo, execution: { id: "echo", label: "v2" } }), {
      ifVersion: version,
    })
    expect(next.version).not.toBe(version)
    await expect(
      files.write(execPath, manifestExecutionText(echo), { ifVersion: version }),
    ).rejects.toMatchObject({ code: "ECP_VERSION_CONFLICT" })
    expect(readFileSync(execPath, "utf8")).toContain('"label": "v2"')
  })

  it("skips unreadable files when listing", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ecp-skip-list-"))
    writeFileSync(path.join(dir, "good.ecp.json"), manifestExecutionText(echo))
    writeFileSync(path.join(dir, "bad.ecp.json"), "{not json")
    const listed = await files.list(dir)
    expect(listed.length).toBeGreaterThanOrEqual(1)
  })

  it("lists execution files and reads scripts", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ecp-list-"))
    const script = path.join(dir, "run.js")
    writeFileSync(script, "export const v = 1\n")
    const manifest: ExecutionManifest = {
      ...echo,
      steps: [
        {
          id: "s",
          uses: "@executioncontrolprotocol/test.echo",
          input: { value: { $script: { path: "run.js", lang: "javascript", params: {} } } },
          as: "s",
        },
      ],
    }
    const execPath = path.join(dir, "flow.ecp.json")
    writeFileSync(execPath, manifestExecutionText(manifest))
    const listed = await files.list(dir)
    expect(listed.some((row) => row.path.endsWith("flow.ecp.json"))).toBe(true)
    const scripts = await files.readScripts(dir, manifest)
    expect(scripts["run.js"]).toContain("export const v")
    expect(listExecutionFilePaths(path.join(dir, "missing"))).toEqual([])
  })

  it("rejects manifest script paths that escape the directory", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ecp-esc-manifest-"))
    const manifest: ExecutionManifest = {
      ...echo,
      steps: [
        {
          id: "s",
          uses: "@executioncontrolprotocol/test.echo",
          input: { value: { $script: { path: "../outside.js", lang: "javascript", params: {} } } },
          as: "s",
        },
      ],
    }
    await expect(files.readScripts(dir, manifest)).rejects.toMatchObject({ code: "ECP_REQUEST_INVALID" })
  })

  it("rejects escaping script keys and missing files", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ecp-escape-"))
    expect(resolveScriptKey(dir, "../x.js")).toBe("escape")
    expect(resolveScriptKey(dir, "")).toBe("escape")
    expect(resolveScriptKey(dir, "ok.js")).toBe(path.join(dir, "ok.js"))
    expect(resolveScriptKey(dir, path.join("/abs", "x.js"))).toBe("absolute")
    const execPath = path.join(dir, "a.ecp.json")
    writeFileSync(execPath, manifestExecutionText(echo))
    await expect(
      files.write(execPath, manifestExecutionText(echo), { scripts: { "../x.js": "bad" } }),
    ).rejects.toMatchObject({ code: "ECP_REQUEST_INVALID" })
    const manifest: ExecutionManifest = {
      ...echo,
      steps: [
        {
          id: "s",
          uses: "@executioncontrolprotocol/test.echo",
          input: { value: { $script: { path: "missing.js", lang: "javascript", params: {} } } },
          as: "s",
        },
      ],
    }
    await expect(files.readScripts(dir, manifest)).rejects.toBeInstanceOf(StorageError)
  })

  it("rejects oversize scripts map values and bad remove version", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ecp-script-cap-"))
    const execPath = path.join(dir, "a.ecp.json")
    writeFileSync(execPath, manifestExecutionText(echo))
    const { version } = await files.stat(execPath)
    const big = "x".repeat(SCRIPTS_MAP_MAX_BYTES + 1)
    await expect(files.write(execPath, manifestExecutionText(echo), { scripts: { "h.js": big } })).rejects.toMatchObject({
      code: "ECP_REQUEST_INVALID",
    })
    await expect(files.remove(execPath, "stale")).rejects.toMatchObject({ code: "ECP_VERSION_CONFLICT" })
    await files.remove(execPath, version)
  })

  it("rejects oversize execution and missing stat", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ecp-bad-"))
    const missing = path.join(dir, "nope.ecp.json")
    await expect(files.stat(missing)).rejects.toBeInstanceOf(StorageError)
    const execPath = path.join(dir, "big.ecp.json")
    writeFileSync(execPath, `${"x".repeat(2 * 1024 * 1024 + 10)}`)
    await expect(files.stat(execPath)).rejects.toMatchObject({ code: "ECP_REQUEST_INVALID" })
  })

  it("writes without ifVersion and rejects oversize referenced scripts on stat", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ecp-stat-script-"))
    const script = path.join(dir, "big.js")
    writeFileSync(script, "x".repeat(SCRIPTS_MAP_MAX_BYTES + 1))
    const manifest: ExecutionManifest = {
      ...echo,
      steps: [
        {
          id: "s",
          uses: "@executioncontrolprotocol/test.echo",
          input: { value: { $script: { path: "big.js", lang: "javascript", params: {} } } },
          as: "s",
        },
      ],
    }
    const execPath = path.join(dir, "flow.ecp.json")
    writeFileSync(execPath, manifestExecutionText(manifest))
    await expect(files.stat(execPath)).rejects.toMatchObject({ code: "ECP_REQUEST_INVALID" })
    const plain = mkdtempSync(path.join(os.tmpdir(), "ecp-no-ifv-"))
    const plainExec = path.join(plain, "a.ecp.json")
    writeFileSync(plainExec, manifestExecutionText(echo))
    await expect(
      files.write(plainExec, manifestExecutionText({ ...echo, execution: { id: "a", label: "no-if" } })),
    ).resolves.toBeDefined()
  })

  it("rejects oversize execution text on write", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ecp-big-write-"))
    const execPath = path.join(dir, "a.ecp.json")
    writeFileSync(execPath, manifestExecutionText(echo))
    const big = `${manifestExecutionText(echo)}${" ".repeat(2 * 1024 * 1024)}`
    await expect(files.write(execPath, big)).rejects.toMatchObject({ code: "ECP_REQUEST_INVALID" })
  })

  it("refuses writing a missing execution file", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ecp-missing-write-"))
    await expect(files.write(path.join(dir, "missing.ecp.json"), manifestExecutionText(echo))).rejects.toBeInstanceOf(
      StorageError,
    )
  })

  it("remove fails when the file is missing", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ecp-rm-miss-"))
    await expect(files.remove(path.join(dir, "gone.ecp.json"), "v")).rejects.toBeInstanceOf(StorageError)
  })

  it("removes a file when version matches", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ecp-rm-"))
    const execPath = path.join(dir, "a.ecp.json")
    writeFileSync(execPath, manifestExecutionText(echo))
    const { version } = await files.stat(execPath)
    await files.remove(execPath, version)
    await expect(files.stat(execPath)).rejects.toBeInstanceOf(StorageError)
  })
})