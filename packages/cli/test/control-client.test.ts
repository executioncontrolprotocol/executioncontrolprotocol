import { describe, expect, it } from "vitest"
import { ControlClient } from "../src/lib/control-client.js"
import type { HostFile } from "@executioncontrolprotocol/protocol"

describe("ControlClient", () => {
  it("maps 401 to ECP_UNAUTHORIZED", async () => {
    const original = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response("nope", { status: 401 })) as typeof fetch
    try {
      const client = new ControlClient({
        controlPort: 9,
        token: "x".repeat(43),
        port: 8,
        hostPid: 1,
        supervisorPid: 1,
        hostVersion: "1.0.0",
        startedAt: new Date().toISOString(),
        home: "/tmp",
      } as HostFile)
      await expect(client.status()).rejects.toMatchObject({ code: "ECP_UNAUTHORIZED" })
    } finally {
      globalThis.fetch = original
    }
  })

  it("accepts 204 bodies for stop/restart", async () => {
    const original = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(null, { status: 204 })) as typeof fetch
    try {
      const client = new ControlClient({
        controlPort: 9,
        token: "y".repeat(43),
        port: 8,
        hostPid: 1,
        supervisorPid: 1,
        hostVersion: "1.0.0",
        startedAt: new Date().toISOString(),
        home: "/tmp",
      } as HostFile)
      await expect(client.stop(true)).resolves.toBeUndefined()
      await expect(client.restart()).resolves.toBeUndefined()
    } finally {
      globalThis.fetch = original
    }
  })

  it("parses JSON status and maps other failures", async () => {
    const original = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ hostStatus: "running", restarts: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch
    try {
      const client = new ControlClient({
        controlPort: 9,
        token: "z".repeat(43),
        port: 8,
        hostPid: 1,
        supervisorPid: 1,
        hostVersion: "1.0.0",
        startedAt: new Date().toISOString(),
        home: "/tmp",
      } as HostFile)
      await expect(client.status()).resolves.toMatchObject({ hostStatus: "running" })
    } finally {
      globalThis.fetch = original
    }

    globalThis.fetch = (async () => new Response("down", { status: 503 })) as typeof fetch
    try {
      const client = new ControlClient({
        controlPort: 9,
        token: "z".repeat(43),
        port: 8,
        hostPid: 1,
        supervisorPid: 1,
        hostVersion: "1.0.0",
        startedAt: new Date().toISOString(),
        home: "/tmp",
      } as HostFile)
      await expect(client.stop()).rejects.toMatchObject({ code: "ECP_HOST_UNAVAILABLE" })
    } finally {
      globalThis.fetch = original
    }
  })
})
