import { mkdirSync, writeFileSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { createLocalHost, generateHostToken, type LocalHost } from "../src/index.js"
import { watchExecutionPath } from "../src/http/path-watch.js"

const pluginTestRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../plugins/plugin-test",
)

const smallest = {
  schema: "@executioncontrolprotocol.execution",
  version: "2.0",
  steps: [
    {
      id: "echo",
      uses: "@executioncontrolprotocol/test.echo",
      input: { value: "x" },
      as: "out",
    },
  ],
}

describe("path watch", () => {
  let host: LocalHost | undefined

  afterEach(async () => {
    if (host) await host.stop()
    host = undefined
  })

  it("emits when the execution file changes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ecp-path-watch-"))
    const execPath = path.join(dir, "demo.ecp.json")
    writeFileSync(execPath, `${JSON.stringify(smallest, null, 2)}\n`)

    const events: string[] = []
    const stop = watchExecutionPath(execPath, (event) => {
      events.push(event.path)
    })

    await new Promise((r) => setTimeout(r, 50))
    writeFileSync(
      execPath,
      `${JSON.stringify({ ...smallest, execution: { label: "changed" } }, null, 2)}\n`,
    )

    await expect
      .poll(() => events.length > 0, { timeout: 3_000 })
      .toBe(true)
    expect(events[0]).toBe(path.resolve(execPath))
    stop()
  })

  it("emits when a referenced $script.path file changes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ecp-script-watch-"))
    const scriptPath = path.join(dir, "banner.js")
    writeFileSync(scriptPath, "export const x = 1\n")
    const execPath = path.join(dir, "script.ecp.json")
    writeFileSync(
      execPath,
      `${JSON.stringify(
        {
          schema: "@executioncontrolprotocol.execution",
          version: "2.0",
          steps: [
            {
              id: "echo",
              uses: "@executioncontrolprotocol/test.echo",
              input: { value: { $script: { lang: "js", path: "banner.js" } } },
              as: "out",
            },
          ],
        },
        null,
        2,
      )}\n`,
    )

    const events: string[] = []
    const stop = watchExecutionPath(execPath, (event) => {
      events.push(event.path)
    })

    await new Promise((r) => setTimeout(r, 50))
    writeFileSync(scriptPath, "export const x = 2\n")

    await expect
      .poll(() => events.some((p) => p === path.resolve(scriptPath)), { timeout: 3_000 })
      .toBe(true)
    stop()
  })

  it("rejects non-execution paths on /v1/watch", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-watch-bad-"))
    mkdirSync(home, { recursive: true })
    const token = generateHostToken()
    host = await createLocalHost({
      home,
      mode: "server",
      port: 0,
      token,
      extraPlugins: [pluginTestRoot],
    })
    const port = Number(new URL(host.url!).port)
    const { request } = await import("node:http")
    const body = await new Promise<string>((resolve, reject) => {
      const req = request(
        {
          hostname: "127.0.0.1",
          port,
          path: `/v1/watch?path=${encodeURIComponent(path.join(home, "notes.txt"))}`,
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Host: `127.0.0.1:${port}`,
          },
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on("data", (c) => chunks.push(c))
          res.on("end", () => {
            expect(res.statusCode).toBe(400)
            resolve(Buffer.concat(chunks).toString("utf8"))
          })
        },
      )
      req.on("error", reject)
      req.end()
    })
    expect(body).toContain("ECP_REQUEST_INVALID")
  })

  it("streams file events over /v1/watch?path=", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-watch-sse-"))
    const execPath = path.join(home, "live.ecp.json")
    writeFileSync(execPath, `${JSON.stringify(smallest, null, 2)}\n`)
    const token = generateHostToken()
    host = await createLocalHost({
      home,
      mode: "server",
      port: 0,
      token,
      extraPlugins: [pluginTestRoot],
    })
    const port = Number(new URL(host.url!).port)
    const { request } = await import("node:http")
    const chunks: string[] = []
    await new Promise<void>((resolve, reject) => {
      const req = request(
        {
          hostname: "127.0.0.1",
          port,
          path: `/v1/watch?path=${encodeURIComponent(execPath)}`,
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Host: `127.0.0.1:${port}`,
            Accept: "text/event-stream",
          },
        },
        (res) => {
          expect(res.statusCode).toBe(200)
          res.setEncoding("utf8")
          res.on("data", (chunk: string) => {
            chunks.push(chunk)
            if (chunks.join("").includes("event: file")) {
              req.destroy()
              resolve()
            }
          })
        },
      )
      req.on("error", (error) => {
        if ((error as NodeJS.ErrnoException).code === "ECONNRESET") resolve()
        else reject(error)
      })
      req.end()
      void (async () => {
        await new Promise((r) => setTimeout(r, 80))
        writeFileSync(
          execPath,
          `${JSON.stringify({ ...smallest, execution: { label: "sse" } }, null, 2)}\n`,
        )
      })()
      setTimeout(() => {
        req.destroy()
        resolve()
      }, 5_000)
    })
    expect(chunks.join("")).toContain("event: file")
  }, 15_000)
})
