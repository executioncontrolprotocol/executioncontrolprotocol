import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { StorageProvider } from "@executioncontrolprotocol/protocol"
import { createLocalHost, generateHostToken } from "../src/index.js"
import { rawRequest } from "./http-raw.js"

const pluginTestRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../plugins/plugin-test",
)

describe("GET /v1/watch", () => {
  it("accepts a watch subscription and emits storage changes", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-watch-"))
    const token = generateHostToken()
    const host = await createLocalHost({
      home,
      mode: "server",
      port: 0,
      token,
      extraPlugins: [pluginTestRoot],
    })
    const baseUrl = host.url!
    const port = Number(new URL(baseUrl).port)

    const chunks: string[] = []
    const { request } = await import("node:http")
    await new Promise<void>((resolve, reject) => {
      const req = request(
        {
          hostname: "127.0.0.1",
          port,
          path: `/v1/watch?types=execution,run&runId=missing&path=${encodeURIComponent(home)}`,
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
            if (chunks.join("").includes("watched")) {
              req.destroy()
              resolve()
            }
          })
          res.on("error", reject)
        },
      )
      req.on("error", (error) => {
        if ((error as NodeJS.ErrnoException).code === "ECONNRESET") resolve()
        else reject(error)
      })
      req.end()

      void (async () => {
        await new Promise((r) => setTimeout(r, 50))
        await host.services.get(StorageProvider).putExecution(
          "watched",
          {
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
          { create: true },
        )
      })()

      setTimeout(() => {
        req.destroy()
        resolve()
      }, 5_000)
    })

    const body = chunks.join("")
    expect(body.includes(": connected") || body.includes("event: storage")).toBe(true)
    expect(body).toContain("watched")
    await host.stop()
    void rawRequest
  }, 15_000)
})
