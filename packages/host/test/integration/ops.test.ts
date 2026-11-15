import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { StorageProvider } from "@executioncontrolprotocol/protocol"
import { createLocalHost } from "../../src/index.js"
import { pluginTestRoot, startTestHost } from "./support/harness.js"

describe("host integration operations", () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()?.()
  })

  it("retrieves capabilities, commits, runs wait:false, cancels, and writes output.path", async () => {
    const { host, home } = await startTestHost()
    cleanups.push(() => host.stop())

    const caps = await host.operations.retrieve({ type: "capability", query: "echo", limit: 5 })
    expect(caps.ok).toBe(true)

    const create = await host.operations.commit({
      type: "execution",
      action: "create",
      id: "ops-demo",
      object: {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            id: "wait",
            uses: "@executioncontrolprotocol/test.delay",
            input: { ms: 2000 },
            as: "waited",
          },
        ],
      },
    })
    expect(create.ok).toBe(true)

    const started = await host.operations.execute({
      execution: { id: "ops-demo" },
      wait: false,
    })
    expect(started.ok).toBe(true)
    if (!started.ok) return
    const cancel = await host.operations.execute({ cancel: started.data.runId })
    expect(cancel.ok).toBe(true)

    const outPath = path.join(home, "out.json")
    const echo = await host.operations.execute({
      execution: {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            id: "echo",
            uses: "@executioncontrolprotocol/test.echo",
            input: { value: "hi" },
            as: "out",
          },
        ],
      },
      output: { path: outPath },
    })
    expect(echo.ok).toBe(true)

    const schema = await import("node:fs/promises").then((fs) =>
      fs.readFile(path.join(home, "schema/execution.schema.json"), "utf8"),
    )
    expect(schema).toContain("execution")
    expect(host.schemaHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it("marks leftover running runs as interrupted on startup", async () => {
    const { host, home } = await startTestHost({ extraPlugins: [pluginTestRoot] })
    const storage = host.services.get(StorageProvider)
    await storage.runs.create(
      {
        schema: "@executioncontrolprotocol.run",
        version: "1.0",
        id: "run-leftover",
        execution: { path: null, manifestHash: "x" },
        status: "running",
        input: {},
        result: null,
        error: null,
        startedAt: new Date().toISOString(),
        plugins: {},
        host: { version: "2.0.0", pid: 1 },
      },
      {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [],
      },
    )
    await host.stop()

    const again = await createLocalHost({
      home,
      mode: "in-process",
      extraPlugins: [pluginTestRoot],
    })
    cleanups.push(() => again.stop())
    const detail = await again.services.get(StorageProvider).runs.get("run-leftover", ["events"])
    expect(detail?.status).toBe("interrupted")
    expect(detail?.events?.some((event) => event.type === "run.interrupted")).toBe(true)
  })
})
