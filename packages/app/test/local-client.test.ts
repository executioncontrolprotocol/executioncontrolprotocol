import { describe, expect, it } from "vitest"
import { createLocalHostAdapter, type LocalHostTransport } from "../src/host/local-client.js"
import type { AppEventMessage } from "../src/host/protocol.js"
import type {
  EnvironmentDescriptor,
  PublicRunEvent,
  RequirementsDocument,
  WorkflowManifest,
} from "@executioncontrolprotocol/core/types"

const MANIFEST: WorkflowManifest = {
  schema: "@executioncontrolprotocol.workflow",
  version: "1.0",
  workflow: { id: "echo" },
  steps: [{ id: "echo", uses: "@executioncontrolprotocol/test.echo", input: { value: "hi" } }],
}

const REQUIREMENTS: RequirementsDocument = {
  schema: "@executioncontrolprotocol.requirements",
  version: "1.0",
  requirements: [],
}

function createMockTransport(overrides?: {
  source?: Record<string, unknown>
  events?: AppEventMessage[]
}): LocalHostTransport {
  const puts: unknown[] = []
  const listeners: Array<(message: AppEventMessage) => void> = []
  return {
    async get(path: string) {
      if (path === "/api/source") {
        return {
          path: "workflow.ecp.ts",
          source: "export default workflow('Echo').run([])",
          manifest: MANIFEST,
          requirements: REQUIREMENTS,
          roundTrip: { ok: true, reasons: [] },
          ...overrides?.source,
        }
      }
      if (path === "/api/describe") {
        return { schema: "@executioncontrolprotocol.environment.describe", version: "1.0" } as EnvironmentDescriptor
      }
      if (path === "/api/environment") {
        return {
          kind: "process-host",
          source: 'export default environment("node").with([])',
        }
      }
      if (path.startsWith("/api/search")) {
        return { results: [{ type: "capability", id: "jsonata.transform", score: 1 }] }
      }
      throw new Error(path)
    },
    async put(_path: string, body: unknown) {
      puts.push(body)
      return {
        path: "workflow.ecp.ts",
        source: typeof body === "object" && body && "source" in body ? (body as { source: string }).source : "",
        manifest: MANIFEST,
        requirements: REQUIREMENTS,
        roundTrip: { ok: true, reasons: [] },
      }
    },
    async post(path: string, body: unknown) {
      if (path === "/api/validate") {
        return { schema: "@executioncontrolprotocol.validation.result", version: "1.0", valid: true, errors: [], warnings: [] }
      }
      if (path === "/api/run") {
        for (const message of overrides?.events ?? []) {
          for (const listener of listeners) listener(message)
        }
        return { runId: "run-1", status: "completed", output: { value: "hi" } }
      }
      return body
    },
    subscribe(onMessage) {
      listeners.push(onMessage)
      return () => {
        const index = listeners.indexOf(onMessage)
        if (index >= 0) listeners.splice(index, 1)
      }
    },
  }
}

describe("createLocalHostAdapter", () => {
  it("loads source, manifest, and requirements", async () => {
    const adapter = createLocalHostAdapter({
      baseUrl: "http://127.0.0.1:9",
      token: "secret",
      transport: createMockTransport(),
    })
    const loaded = await adapter.load()
    expect(loaded.path).toBe("workflow.ecp.ts")
    expect(loaded.manifest.workflow.id).toBe("echo")
    expect(loaded.roundTrip.ok).toBe(true)
  })

  it("throws when load diagnostics are present", async () => {
    const adapter = createLocalHostAdapter({
      baseUrl: "http://127.0.0.1:9",
      token: "secret",
      transport: createMockTransport({
        source: {
          manifest: undefined,
          requirements: undefined,
          loadError: {
            schema: "@executioncontrolprotocol.validation.result",
            version: "1.0",
            valid: false,
            errors: [{ code: "ECP_WORKFLOW_LOAD", message: "bad source" }],
            warnings: [],
          },
        },
      }),
    })
    await expect(adapter.load()).rejects.toThrow("bad source")
  })

  it("saves source and searches capabilities", async () => {
    const transport = createMockTransport()
    const adapter = createLocalHostAdapter({
      baseUrl: "http://127.0.0.1:9",
      token: "secret",
      transport,
    })
    await adapter.save("export default workflow('X').run([])")
    const descriptor = await adapter.describe()
    expect(descriptor.schema).toBe("@executioncontrolprotocol.environment.describe")
    const hits = await adapter.search("jsonata")
    expect(hits[0]?.id).toBe("jsonata.transform")
    const validation = await adapter.validate("source")
    expect(validation.valid).toBe(true)
    const environment = await adapter.environment()
    expect(environment.kind).toBe("process-host")
    expect(environment.source).toContain("environment(")
  })

  it("forwards environment watch payloads", async () => {
    const listeners: Array<(message: AppEventMessage) => void> = []
    const transport: LocalHostTransport = {
      ...createMockTransport(),
      subscribe(onMessage) {
        listeners.push(onMessage)
        return () => {
          const index = listeners.indexOf(onMessage)
          if (index >= 0) listeners.splice(index, 1)
        }
      },
    }
    const adapter = createLocalHostAdapter({
      baseUrl: "http://127.0.0.1:9",
      token: "secret",
      transport,
    })
    const seen: string[] = []
    const stop = adapter.watchEnvironment((next) => {
      seen.push(`${next.kind}:${next.source}`)
    })
    for (const listener of listeners) {
      listener({ type: "environment", kind: "process-host", source: "process-host" })
      listener({ type: "file", source: "ignored" })
    }
    stop()
    expect(seen).toEqual(["process-host:process-host"])
  })

  it("yields run events until run.end", async () => {
    const start: PublicRunEvent = {
      type: "run.start",
      runId: "run-1",
      ts: "t0",
    }
    const end: PublicRunEvent = {
      type: "run.end",
      runId: "run-1",
      status: "completed",
      ts: "t1",
    }
    const adapter = createLocalHostAdapter({
      baseUrl: "http://127.0.0.1:9",
      token: "secret",
      transport: createMockTransport({
        events: [
          { type: "run", event: start },
          { type: "run", event: end },
        ],
      }),
    })
    const seen: string[] = []
    const response = await adapter.run("source", {}, (event) => {
      seen.push(event.type)
    })
    expect(seen).toEqual(["run.start", "run.end"])
    expect(response.runId).toBe("run-1")
    expect(response.status).toBe("completed")
    expect(response.output).toEqual({ value: "hi" })
  })

  it("rejects non-ok fetch responses without logging the token", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response("denied", { status: 401, statusText: "Unauthorized" })
    const adapter = createLocalHostAdapter({
      baseUrl: "http://127.0.0.1:9",
      token: "secret-token-value",
      fetchImpl,
    })
    await expect(adapter.load()).rejects.toThrow(/401/)
    await expect(adapter.load()).rejects.not.toThrow(/secret-token-value/)
  })

  it("forwards file watch payloads", async () => {
    const listeners: Array<(message: AppEventMessage) => void> = []
    const transport: LocalHostTransport = {
      ...createMockTransport(),
      subscribe(onMessage) {
        listeners.push(onMessage)
        return () => {
          const index = listeners.indexOf(onMessage)
          if (index >= 0) listeners.splice(index, 1)
        }
      },
    }
    const adapter = createLocalHostAdapter({
      baseUrl: "http://127.0.0.1:9",
      token: "secret",
      transport,
    })
    const seen: string[] = []
    const stop = adapter.watch((next) => {
      seen.push(next.source)
    })
    for (const listener of listeners) {
      listener({ type: "file", source: "updated" })
    }
    stop()
    expect(seen).toEqual(["updated"])
  })
})
