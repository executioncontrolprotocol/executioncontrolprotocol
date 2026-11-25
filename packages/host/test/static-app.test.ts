import { mkdirSync, writeFileSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createLocalHost, generateHostToken, type LocalHost } from "../src/index.js"
import { rawRequest } from "./http-raw.js"

describe("GET /app static", () => {
  let host: LocalHost | undefined

  afterEach(async () => {
    if (host) await host.stop()
    host = undefined
  })

  it("serves index.html with no-cache and hashed assets immutable", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ecp-app-static-"))
    const web = path.join(root, "web")
    mkdirSync(path.join(web, "assets"), { recursive: true })
    writeFileSync(path.join(web, "index.html"), "<!doctype html><title>ECP</title>")
    writeFileSync(path.join(web, "assets", "app-abc123.js"), "console.log(1)")

    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-app-home-"))
    const token = generateHostToken()
    host = await createLocalHost({
      home,
      mode: "server",
      port: 0,
      token,
      appRoot: web,
    })

    const index = await rawRequest({
      baseUrl: host.url!,
      method: "GET",
      path: "/app/",
      headers: { Host: new URL(host.url!).host },
    })
    expect(index.status).toBe(200)
    expect(index.headers["content-type"]).toContain("text/html")
    expect(index.headers["cache-control"]).toBe("no-cache")
    expect(index.body).toContain("ECP")

    const asset = await rawRequest({
      baseUrl: host.url!,
      method: "GET",
      path: "/app/assets/app-abc123.js",
      headers: { Host: new URL(host.url!).host },
    })
    expect(asset.status).toBe(200)
    expect(asset.headers["cache-control"]).toContain("immutable")
    expect(asset.body).toContain("console.log")

    const rootRedirect = await rawRequest({
      baseUrl: host.url!,
      method: "GET",
      path: "/",
      headers: { Host: new URL(host.url!).host },
    })
    expect(rootRedirect.status).toBe(302)
    expect(rootRedirect.headers.location).toBe("/app/")
  })

  it("returns 404 when the App bundle is missing", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-app-missing-"))
    const token = generateHostToken()
    host = await createLocalHost({
      home,
      mode: "server",
      port: 0,
      token,
      appRoot: path.join(home, "no-such-web"),
    })
    const res = await rawRequest({
      baseUrl: host.url!,
      method: "GET",
      path: "/app/",
      headers: { Host: new URL(host.url!).host },
    })
    expect(res.status).toBe(404)
  })
})
