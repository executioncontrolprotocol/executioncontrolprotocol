import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { APP_BEARER_PREFIX, APP_TOKEN_QUERY, type AppEventMessage } from "@executioncontrolprotocol/app"
import type { Ecp } from "@executioncontrolprotocol/core"
import { serveApp, type AppServeHandle } from "../src/serve-app.js"
import { ECHO_SOURCE, testHost } from "./host.js"

const TEST_TOKEN = "unit-test-token-unit-test-token-unit"

async function fixtureDir(): Promise<string> {
  const root = join(process.cwd(), ".ecp")
  await mkdir(root, { recursive: true })
  return mkdtemp(join(root, "app-"))
}

async function waitForWsMessage(socket: WebSocket, timeoutMs = 1000): Promise<AppEventMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for app event")), timeoutMs)
    socket.addEventListener(
      "message",
      (event) => {
        clearTimeout(timer)
        resolve(JSON.parse(String(event.data)) as AppEventMessage)
      },
      { once: true }
    )
  })
}

describe("serveApp", () => {
  let ecp: Ecp | undefined
  let handle: AppServeHandle | undefined
  let dir: string | undefined

  afterEach(async () => {
    await handle?.close()
    handle = undefined
    await ecp?.terminate()
    ecp = undefined
    if (dir) await rm(dir, { recursive: true, force: true })
    dir = undefined
  })

  async function start(source = ECHO_SOURCE): Promise<{
    origin: string
    filePath: string
    headers: { Authorization: string }
  }> {
    dir = await fixtureDir()
    const filePath = join(dir, "workflow.ecp.ts")
    await writeFile(filePath, source, "utf8")
    const ctx = await testHost()
    ecp = ctx.ecp
    handle = await serveApp({
      host: ctx.host,
      filePath,
      httpPort: 0,
      token: TEST_TOKEN,
      printListenUrl: false,
      open: false,
    })
    expect(handle.host).toBe("127.0.0.1")
    expect(handle.port).toBeGreaterThan(0)
    return {
      origin: `http://127.0.0.1:${handle.port}`,
      filePath,
      headers: { Authorization: `${APP_BEARER_PREFIX}${TEST_TOKEN}` },
    }
  }

  it("binds 127.0.0.1 and rejects missing or wrong tokens", async () => {
    const { origin, headers } = await start()
    const missing = await fetch(`${origin}/api/source`)
    expect(missing.status).toBe(401)

    const wrong = await fetch(`${origin}/api/source`, {
      headers: { Authorization: `${APP_BEARER_PREFIX}wrong-token-wrong-token-wrong` },
    })
    expect(wrong.status).toBe(401)

    const ok = await fetch(`${origin}/api/source`, { headers })
    expect(ok.status).toBe(200)
    const body = (await ok.json()) as { source: string; manifest?: { workflow: { id: string } } }
    expect(body.source).toContain("test.echo")
    expect(body.manifest?.workflow.id).toBeDefined()
  })

  it("accepts the token as a query parameter", async () => {
    const { origin } = await start()
    const ok = await fetch(`${origin}/api/source?${APP_TOKEN_QUERY}=${TEST_TOKEN}`)
    expect(ok.status).toBe(200)
  })

  it("updates the file on PUT /api/source", async () => {
    const { origin, filePath, headers } = await start()
    const next = ECHO_SOURCE.replace("hi", "from-put")
    const put = await fetch(`${origin}/api/source`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ source: next }),
    })
    expect(put.status).toBe(200)
    expect(await readFile(filePath, "utf8")).toBe(next)
  })

  it("emits a file change event within 1s after a disk edit", async () => {
    const { origin, filePath } = await start()
    const socket = new WebSocket(`${origin.replace("http", "ws")}/api/events?${APP_TOKEN_QUERY}=${TEST_TOKEN}`)
    const pending = waitForWsMessage(socket, 1000)
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve())
      socket.addEventListener("error", () => reject(new Error("websocket failed")))
    })
    await writeFile(filePath, ECHO_SOURCE.replace("hi", "from-disk"), "utf8")
    const message = await pending
    socket.close()
    expect(message.type).toBe("file")
    if (message.type === "file") {
      expect(message.source).toContain("from-disk")
    }
  })

  it("streams run events over the websocket", async () => {
    const { origin, headers } = await start()
    const socket = new WebSocket(`${origin.replace("http", "ws")}/api/events?${APP_TOKEN_QUERY}=${TEST_TOKEN}`)
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve())
      socket.addEventListener("error", () => reject(new Error("websocket failed")))
    })
    const events: AppEventMessage[] = []
    socket.addEventListener("message", (event) => {
      events.push(JSON.parse(String(event.data)) as AppEventMessage)
    })
    const run = await fetch(`${origin}/api/run`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ source: ECHO_SOURCE }),
    })
    expect(run.status).toBe(200)
    const body = (await run.json()) as {
      runId: string
      status?: string
      output?: unknown
    }
    expect(body.runId).toBeTruthy()
    expect(body.status).toBe("completed")
    await expect.poll(() => events.some((item) => item.type === "run")).toBe(true)
    socket.close()
    const runEvents = events.filter((item) => item.type === "run")
    expect(runEvents.some((item) => item.type === "run" && item.event.type === "run.start")).toBe(true)
    expect(runEvents.some((item) => item.type === "run" && item.event.runId === body.runId)).toBe(true)
  })

  it("returns ECP_WORKFLOW_LOAD diagnostics for a broken file and recovers", async () => {
    const { origin, filePath, headers } = await start()
    await writeFile(filePath, "export default 1\n", "utf8")
    const broken = await fetch(`${origin}/api/source`, { headers })
    const brokenBody = (await broken.json()) as { loadError?: { errors: { code: string }[] } }
    expect(brokenBody.loadError?.errors[0]?.code).toBe("ECP_WORKFLOW_LOAD")

    const put = await fetch(`${origin}/api/source`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ source: ECHO_SOURCE }),
    })
    const recovered = (await put.json()) as { loadError?: unknown; manifest?: unknown }
    expect(recovered.loadError).toBeUndefined()
    expect(recovered.manifest).toBeDefined()
  })

  it("serves describe, search, and validate", async () => {
    const { origin, headers } = await start()
    const describe = await fetch(`${origin}/api/describe`, { headers })
    expect(describe.status).toBe(200)
    const descriptor = (await describe.json()) as { environment: { id: string } }
    expect(descriptor.environment.id).toBeTruthy()

    const search = await fetch(`${origin}/api/search?q=echo`, { headers })
    expect(search.status).toBe(200)
    const hits = (await search.json()) as { results: { id: string }[] }
    expect(hits.results.some((row) => row.id.includes("echo"))).toBe(true)

    const validate = await fetch(`${origin}/api/validate`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ source: ECHO_SOURCE }),
    })
    expect(validate.status).toBe(200)
    const result = (await validate.json()) as { valid: boolean }
    expect(result.valid).toBe(true)
  })

  it("rejects a websocket upgrade without a token", async () => {
    const { origin } = await start()
    const socket = new WebSocket(`${origin.replace("http", "ws")}/api/events`)
    await expect(
      new Promise<void>((resolve, reject) => {
        socket.addEventListener("open", () => resolve())
        socket.addEventListener("error", () => reject(new Error("rejected")))
      })
    ).rejects.toThrow(/rejected/)
  })

  it("rejects PUT, validate, and run bodies that omit source", async () => {
    const { origin, headers } = await start()
    const jsonHeaders = { ...headers, "Content-Type": "application/json" }
    const put = await fetch(`${origin}/api/source`, {
      method: "PUT",
      headers: jsonHeaders,
      body: JSON.stringify({}),
    })
    expect(put.status).toBe(400)
    const validate = await fetch(`${origin}/api/validate`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({}),
    })
    expect(validate.status).toBe(400)
    const run = await fetch(`${origin}/api/run`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({}),
    })
    expect(run.status).toBe(400)
    const missing = await fetch(`${origin}/api/nope`, { headers })
    expect(missing.status).toBe(404)
  })

  it("writes and reads /v1/media through the bound disk store", async () => {
    const { origin, headers } = await start()
    const previous = process.env.ECP_ARTIFACTS_DIR
    process.env.ECP_ARTIFACTS_DIR = join(dir!, "artifacts")
    try {
      const bytes = Buffer.from([7, 8, 9]).toString("base64")
      const post = await fetch(`${origin}/v1/media`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          bytes,
          mediaType: "image/png",
          name: "t.png",
          prefix: "artifacts/images",
        }),
      })
      expect(post.status).toBe(200)
      const ref = (await post.json()) as { kind: string; uri: string }
      expect(ref.kind).toBe("artifact")
      expect(ref.uri).toContain("ecp://file/")
      const get = await fetch(`${origin}/v1/media?uri=${encodeURIComponent(ref.uri)}`, { headers })
      expect(get.status).toBe(200)
      const body = (await get.json()) as { bytes: string; sizeBytes: number }
      expect(body.sizeBytes).toBe(3)
      expect(body.bytes).toBe(bytes)
    } finally {
      if (previous === undefined) delete process.env.ECP_ARTIFACTS_DIR
      else process.env.ECP_ARTIFACTS_DIR = previous
    }
  })

  it("does not bind beyond loopback", async () => {
    dir = await fixtureDir()
    const filePath = join(dir, "workflow.ecp.ts")
    await writeFile(filePath, ECHO_SOURCE, "utf8")
    const ctx = await testHost()
    ecp = ctx.ecp
    await expect(
      serveApp({
        host: ctx.host,
        filePath,
        httpHost: "0.0.0.0",
        httpPort: 0,
        token: TEST_TOKEN,
        printListenUrl: false,
        open: false,
      })
    ).rejects.toThrow(/loopback/)
  })
})
