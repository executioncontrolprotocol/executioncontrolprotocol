import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { HOST_SCHEMA, HOST_VERSION, type HostFile } from "@executioncontrolprotocol/protocol"
import {
  allocateLoopbackPort,
  checkHealth,
  generateHostToken,
  hostHeaderFor,
  readHostJson,
  VERSION,
} from "../src/index.js"
import { refuse, statusForEnvelope } from "../src/http/envelope.js"
import { listExecutionFiles, readAllowedFile, scriptPathsOf } from "../src/http/files.js"
describe("host helpers", () => {
  it("allocates a loopback port and formats health helpers", async () => {
    const port = await allocateLoopbackPort()
    expect(port).toBeGreaterThan(0)
    expect(hostHeaderFor(`http://127.0.0.1:${port}`)).toBe(`127.0.0.1:${port}`)
    expect(await checkHealth(`http://127.0.0.1:${port}`)).toBeUndefined()
    expect(generateHostToken()).toHaveLength(43)
  })

  it("reads host.json and maps envelopes", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-hostjson-"))
    expect(readHostJson(home)).toBeUndefined()
    const file: HostFile = {
      schema: HOST_SCHEMA,
      version: HOST_VERSION,
      supervisorPid: 1,
      hostPid: 2,
      port: 3,
      controlPort: 4,
      token: generateHostToken(),
      hostVersion: VERSION,
      startedAt: new Date().toISOString(),
      home,
    }
    writeFileSync(path.join(home, "host.json"), JSON.stringify(file))
    expect(readHostJson(home)?.port).toBe(3)

    expect(statusForEnvelope({ ok: true, data: {} })).toBe(200)
    expect(statusForEnvelope(refuse("ECP_UNAUTHORIZED", "no"))).toBe(401)
    expect(statusForEnvelope(refuse("ECP_HOST_RESTARTING", "drain", { retryAfterMs: 1000 }))).toBe(503)
    expect(statusForEnvelope(refuse("ECP_SECRET_MISSING", "missing"))).toBe(500)
    expect(statusForEnvelope(refuse("NOT_A_CODE", "x"))).toBe(500)
  })

  it("lists and reads allowed execution files", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ecp-files-unit-"))
    const script = path.join(dir, "body.js")
    writeFileSync(script, "export default 1")
    const manifestPath = path.join(dir, "demo.ecp.json")
    const manifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "s", uses: "x", input: { code: { $script: { path: "body.js" } } }, as: "o" }],
    }
    writeFileSync(manifestPath, JSON.stringify(manifest))
    expect(listExecutionFiles(dir)).toEqual([manifestPath])
    expect(listExecutionFiles(path.join(dir, "missing"))).toEqual([])
    expect(readAllowedFile(manifestPath).ok).toBe(true)
    expect(readAllowedFile(script).ok).toBe(true)
    expect(readAllowedFile(path.join(dir, "nope.txt")).ok).toBe(false)
    expect(scriptPathsOf(JSON.parse(readFileSync(manifestPath, "utf8")), dir)).toContain(script)
  })

  it("rejects oversize and missing files", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ecp-oversize-"))
    const big = path.join(dir, "big.ecp.json")
    writeFileSync(big, "x".repeat(2 * 1024 * 1024 + 10))
    expect(readAllowedFile(big).ok).toBe(false)
    expect(readAllowedFile(path.join(dir, "missing.ecp.json")).ok).toBe(false)
    const nested = path.join(dir, "a", "b")
    mkdirSync(nested, { recursive: true })
    writeFileSync(path.join(nested, "deep.ecp.json"), "{}")
    mkdirSync(path.join(dir, ".hidden"), { recursive: true })
    writeFileSync(path.join(dir, ".hidden", "x.ecp.json"), "{}")
    expect(listExecutionFiles(dir).some((f) => f.includes("deep.ecp.json"))).toBe(true)
  })
})
