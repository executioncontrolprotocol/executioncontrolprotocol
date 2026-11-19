import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { request } from "node:http"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { holdDelayForTests, resetDelayForTests } from "../../../plugins/plugin-test/src/capabilities/delay-hooks.js"
import {
  checkHealth,
  createLocalHost,
  generateHostToken,
  HostClient,
  type LocalHost,
} from "../src/index.js"
import { rawRequest } from "./http-raw.js"

const pluginTestRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../plugins/plugin-test",
)

describe("HttpApiEndpoint", () => {
  let host: LocalHost | undefined
  let token: string
  let baseUrl: string

  afterEach(async () => {
    resetDelayForTests()
    if (host) await host.stop()
    host = undefined
  })

  async function start(): Promise<void> {
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-http-"))
    token = generateHostToken()
    host = await createLocalHost({
      home,
      mode: "server",
      port: 0,
      token,
      extraPlugins: [pluginTestRoot],
    })
    baseUrl = host.url!
  }

  it("serves retrieve commit execute and rejects unauthorized callers", async () => {
    await start()
    const client = new HostClient(baseUrl, token)
    const caps = await client.retrieve({ type: "capability", limit: 20 })
    expect(caps.ok).toBe(true)

    const missing = await rawRequest({
      baseUrl,
      method: "POST",
      path: "/v1/retrieve",
      headers: {
        Host: new URL(baseUrl).host,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "capability" }),
    })
    expect(missing.status).toBe(401)

    const wrong = await rawRequest({
      baseUrl,
      method: "POST",
      path: "/v1/retrieve",
      headers: {
        Authorization: "Bearer wrong-token-wrong-token-wrong-token-xx",
        Host: new URL(baseUrl).host,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "capability" }),
    })
    expect(wrong.status).toBe(401)

    const badHost = await rawRequest({
      baseUrl,
      method: "POST",
      path: "/v1/retrieve",
      headers: {
        Authorization: `Bearer ${token}`,
        Host: "evil.example:1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "capability" }),
    })
    expect(badHost.status).toBe(401)

    const badOrigin = await rawRequest({
      baseUrl,
      method: "POST",
      path: "/v1/retrieve",
      headers: {
        Authorization: `Bearer ${token}`,
        Host: new URL(baseUrl).host,
        Origin: "http://evil.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "capability" }),
    })
    expect(badOrigin.status).toBe(401)

    const unknown = await rawRequest({
      baseUrl,
      method: "GET",
      path: "/v1/nope",
      headers: {
        Authorization: `Bearer ${token}`,
        Host: new URL(baseUrl).host,
      },
    })
    expect(unknown.status).toBe(404)

    const redirect = await rawRequest({ baseUrl, path: "/" })
    expect(redirect.status).toBe(302)
    expect(redirect.headers.location).toBe("/app/")

    const app = await rawRequest({ baseUrl, path: "/app/" })
    // Phase 7: prebuilt bundle is served when packages/app/dist/web exists.
    expect([200, 404]).toContain(app.status)
    if (app.status === 200) {
      expect(String(app.headers["content-type"] ?? "")).toContain("text/html")
    }
  })

  it("rejects oversized bodies with 413", async () => {
    await start()
    const huge = "x".repeat(10 * 1024 * 1024 + 10)
    const response = await rawRequest({
      baseUrl,
      method: "POST",
      path: "/v1/retrieve",
      headers: {
        Authorization: `Bearer ${token}`,
        Host: new URL(baseUrl).host,
        "Content-Type": "application/json",
        "Content-Length": String(huge.length),
      },
      body: huge,
    })
    expect(response.status).toBe(413)
    expect(response.body).toContain("ECP_REQUEST_INVALID")
  })

  it("reads allowed files and lists ecp.json under a directory", async () => {
    await start()
    const dir = await mkdtemp(path.join(os.tmpdir(), "ecp-files-"))
    const file = path.join(dir, "demo.ecp.json")
    writeFileSync(
      file,
      JSON.stringify({
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [],
      }),
    )
    writeFileSync(path.join(dir, "skip.txt"), "nope")
    mkdirSync(path.join(dir, "node_modules"), { recursive: true })
    writeFileSync(path.join(dir, "node_modules", "x.ecp.json"), "{}")

    const listed = await rawRequest({
      baseUrl,
      path: `/v1/files?dir=${encodeURIComponent(dir)}`,
      headers: {
        Authorization: `Bearer ${token}`,
        Host: new URL(baseUrl).host,
      },
    })
    expect(listed.status).toBe(200)
    const listedBody = JSON.parse(listed.body) as { data: { files: string[] } }
    expect(listedBody.data.files).toEqual([file])

    const got = await rawRequest({
      baseUrl,
      path: `/v1/file?path=${encodeURIComponent(file)}`,
      headers: {
        Authorization: `Bearer ${token}`,
        Host: new URL(baseUrl).host,
      },
    })
    expect(got.status).toBe(200)
    expect(got.body).toContain("@executioncontrolprotocol.execution")

    const denied = await rawRequest({
      baseUrl,
      path: `/v1/file?path=${encodeURIComponent(path.join(dir, "skip.txt"))}`,
      headers: {
        Authorization: `Bearer ${token}`,
        Host: new URL(baseUrl).host,
      },
    })
    expect(denied.status).toBe(400)
  })

  it("PUT /v1/file writes a watched execution and refuses other paths", async () => {
    await start()
    const dir = await mkdtemp(path.join(os.tmpdir(), "ecp-put-"))
    const file = path.join(dir, "demo.ecp.json")
    const other = path.join(dir, "other.ecp.json")
    const manifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      execution: { id: "demo", label: "Before" },
      steps: [],
    }
    writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
    writeFileSync(other, `${JSON.stringify({ ...manifest, execution: { id: "other", label: "Other" } }, null, 2)}\n`)

    const port = Number(new URL(baseUrl).port)
    const hostHeader = `127.0.0.1:${port}`
    const authHeaders = { Authorization: `Bearer ${token}`, Host: hostHeader }

    const notWatched = await rawRequest({
      baseUrl,
      method: "PUT",
      path: `/v1/file?path=${encodeURIComponent(file)}`,
      headers: { ...authHeaders, "Content-Type": "text/plain; charset=utf-8" },
      body: `${JSON.stringify({ ...manifest, execution: { id: "demo", label: "Hacked" } }, null, 2)}\n`,
    })
    expect(notWatched.status).toBe(400)
    expect(notWatched.body).toContain("ECP_REQUEST_INVALID")

    await new Promise<void>((resolve, reject) => {
      const watchReq = request(
        {
          hostname: "127.0.0.1",
          port,
          path: `/v1/watch?path=${encodeURIComponent(file)}`,
          method: "GET",
          headers: { ...authHeaders, Accept: "text/event-stream" },
        },
        (res) => {
          expect(res.statusCode).toBe(200)
          let buf = ""
          res.setEncoding("utf8")
          res.on("data", (chunk: string) => {
            buf += chunk
            if (!buf.includes(": connected")) return
            void (async () => {
              const updated = { ...manifest, execution: { id: "demo", label: "After" } }
              const body = `${JSON.stringify(updated, null, 2)}\n`
              const ok = await rawRequest({
                baseUrl,
                method: "PUT",
                path: `/v1/file?path=${encodeURIComponent(file)}`,
                headers: { ...authHeaders, "Content-Type": "text/plain; charset=utf-8" },
                body,
              })
              expect(ok.status).toBe(204)
              expect(JSON.parse(readFileSync(file, "utf8")).execution.label).toBe("After")

              const wrongFile = await rawRequest({
                baseUrl,
                method: "PUT",
                path: `/v1/file?path=${encodeURIComponent(other)}`,
                headers: { ...authHeaders, "Content-Type": "text/plain; charset=utf-8" },
                body,
              })
              expect(wrongFile.status).toBe(400)

              const relative = await rawRequest({
                baseUrl,
                method: "PUT",
                path: `/v1/file?path=${encodeURIComponent("demo.ecp.json")}`,
                headers: { ...authHeaders, "Content-Type": "text/plain; charset=utf-8" },
                body,
              })
              expect(relative.status).toBe(400)

              const missing = await rawRequest({
                baseUrl,
                method: "PUT",
                path: `/v1/file?path=${encodeURIComponent(path.join(dir, "nope.ecp.json"))}`,
                headers: { ...authHeaders, "Content-Type": "text/plain; charset=utf-8" },
                body,
              })
              expect(missing.status).toBe(400)
              expect(missing.body).toContain("not open")

              const huge = await rawRequest({
                baseUrl,
                method: "PUT",
                path: `/v1/file?path=${encodeURIComponent(file)}`,
                headers: { ...authHeaders, "Content-Type": "text/plain; charset=utf-8" },
                body: "x".repeat(2 * 1024 * 1024 + 1),
              })
              expect(huge.status).toBe(413)

              watchReq.destroy()
              resolve()
            })().catch(reject)
          })
          res.on("error", reject)
        },
      )
      watchReq.on("error", (error) => {
        if ((error as NodeJS.ErrnoException).code === "ECONNRESET") resolve()
        else reject(error)
      })
      watchReq.end()
    })
  }, 15_000)

  it("drains active delay runs, rejects new execute, and allows retrieve", async () => {
    await start()
    const client = new HostClient(baseUrl, token)
    const running = await client.execute({
      execution: {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            id: "wait",
            uses: "@executioncontrolprotocol/test.delay",
            // Long enough to stay active for the whole test; the drain timeout below ends it.
            input: { ms: 10_000 },
            as: "done",
          },
        ],
      },
      wait: false,
    })
    expect(running.ok).toBe(true)

    const drainPromise = client.drain(1_500)
    // Wait until the host reports draining (no fixed sleep: ordering must not depend on load).
    const deadline = Date.now() + 5_000
    while ((await checkHealth(baseUrl))?.status !== "draining") {
      if (Date.now() > deadline) throw new Error("host never reported draining")
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    const blocked = await client.execute({
      execution: {
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
      },
    })
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) {
      expect(blocked.error.code).toBe("ECP_HOST_RESTARTING")
      expect(blocked.error.retryAfterMs).toBe(1000)
    }
    const caps = await client.retrieve({ type: "capability", limit: 5 })
    expect(caps.ok).toBe(true)
    const drained = await drainPromise
    expect(drained.ok).toBe(true)
    await host!.stop()
    host = undefined
  }, 20_000)

  it("shuts down via admin route without exiting the test process", async () => {
    await start()
    const client = new HostClient(baseUrl, token)
    await expect(
      client.commit({
        type: "execution",
        action: "create",
        id: "c1",
        object: {
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
        },
      }),
    ).resolves.toMatchObject({ ok: true })
    const validated = await client.execute({
      mode: "validate",
      execution: {
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
      },
    })
    expect(validated.ok).toBe(true)
    await client.drain(0)
    const stillValidate = await client.execute({
      mode: "validate",
      execution: {
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
      },
    })
    expect(stillValidate.ok).toBe(true)

    const emptyBody = await rawRequest({
      baseUrl,
      method: "POST",
      path: "/v1/retrieve",
      headers: {
        Authorization: `Bearer ${token}`,
        Host: new URL(baseUrl).host,
        "Content-Type": "application/json",
        "Content-Length": "0",
      },
    })
    expect(emptyBody.status).toBe(200)

    const badJson = await rawRequest({
      baseUrl,
      method: "POST",
      path: "/v1/retrieve",
      headers: {
        Authorization: `Bearer ${token}`,
        Host: new URL(baseUrl).host,
        "Content-Type": "application/json",
      },
      body: "{not-json",
    })
    expect(badJson.status).toBe(400)

    const missingFile = await rawRequest({
      baseUrl,
      path: "/v1/file",
      headers: { Authorization: `Bearer ${token}`, Host: new URL(baseUrl).host },
    })
    expect(missingFile.status).toBe(400)
    const missingDir = await rawRequest({
      baseUrl,
      path: "/v1/files",
      headers: { Authorization: `Bearer ${token}`, Host: new URL(baseUrl).host },
    })
    expect(missingDir.status).toBe(400)

    const shutdown = host!.whenShutdown()
    const result = await client.shutdown()
    expect(result.ok).toBe(true)
    await shutdown
    host = undefined
  }, 30_000) // commit + two validates each rebuild the combined schema today (F7); S3 caches it

  it("force-drains a run to interrupted and resumes after host restart", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-http-resume-"))
    token = generateHostToken()
    host = await createLocalHost({
      home,
      mode: "server",
      port: 0,
      token,
      extraPlugins: [pluginTestRoot],
    })
    baseUrl = host.url!
    const client = new HostClient(baseUrl, token)
    holdDelayForTests()
    const mid = await client.execute({
      execution: {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            id: "wait",
            uses: "@executioncontrolprotocol/test.delay",
            input: { ms: 5_000, hold: true },
            as: "done",
          },
        ],
      },
      wait: false,
    })
    expect(mid.ok).toBe(true)
    if (!mid.ok) return
    const forceId = mid.data.runId
    await expect
      .poll(
        async () => {
          const run = await client.retrieve({ type: "run", id: forceId })
          if (!run.ok || !("item" in run.data)) return undefined
          return (run.data.item as { status?: string }).status === "running" ? true : undefined
        },
        { timeout: 5_000 },
      )
      .toBe(true)
    const forced = await client.drain(0)
    expect(forced.ok).toBe(true)
    if (forced.ok) expect(forced.data.interrupted).toContain(forceId)
    await host.stop()

    host = await createLocalHost({
      home,
      mode: "server",
      port: 0,
      token,
      extraPlugins: [pluginTestRoot],
    })
    baseUrl = host.url!
    const client2 = new HostClient(baseUrl, token)
    const status = await client2.retrieve({ type: "run", id: forceId })
    expect(status.ok).toBe(true)
    if (status.ok && "item" in status.data) {
      expect((status.data.item as { status: string }).status).toBe("interrupted")
    }
    const resumed = await client2.execute({ resume: forceId })
    expect(resumed.ok).toBe(true)
  }, 20_000)
})
