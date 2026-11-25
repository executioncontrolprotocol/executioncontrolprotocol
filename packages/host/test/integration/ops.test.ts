import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { loadExecutionText } from "@executioncontrolprotocol/engine"
import { PluginAdapter, StorageProvider } from "@executioncontrolprotocol/protocol"
import { createLocalHost, VERSION } from "../../src/index.js"
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

  it("runs the bundled transform example", async () => {
    const { host } = await startTestHost({ extraPlugins: [] })
    cleanups.push(() => host.stop())
    const greetPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../examples/transform/greet.ecp.json",
    )
    const transform = host.services
      .get(PluginAdapter)
      .capabilities()
      .find((row) => row.id.endsWith(".transform"))
    expect(transform?.code).toBe("script")
    const inline = loadExecutionText(
      await host.services.get(StorageProvider).readExecutionFile(greetPath),
    ).manifest as { steps: Array<{ script?: unknown }> }
    const validateOnly = await host.operations.execute({ execution: inline as never, mode: "validate" })
    expect(validateOnly.ok).toBe(true)
    expect(inline.steps[0]?.script).toBeTruthy()
    const result = await host.operations.execute({ execution: inline as never })
    expect(result.ok, !result.ok ? JSON.stringify(result.error) : "").toBe(true)
    if (result.ok) {
      expect(result.data.error, JSON.stringify(result.data, null, 2)).toBeUndefined()
      expect(result.data.status).toBe("completed")
      expect(result.data.result).toMatchObject({ result: { greeting: "Hello, world!" } })
    }
  })

  it("marks leftover running runs as interrupted on startup", async () => {
    const { host, home } = await startTestHost({ extraPlugins: [pluginTestRoot] })
    const storage = host.services.get(StorageProvider)
    await storage.runs.create(
      {
        schema: "@executioncontrolprotocol.run",
        version: "1.0",
        id: "run-leftover",
        execution: { path: null, manifestHash: "abc" },
        status: "running",
        input: {},
        result: null,
        error: null,
        startedAt: new Date().toISOString(),
        plugins: {},
        host: { version: VERSION, pid: 1, mode: "in-process" },
      },
      tiny,
    )
    await host.stop()
    const again = await createLocalHost({
      home,
      mode: "in-process",
      extraPlugins: [pluginTestRoot],
    })
    cleanups.push(() => again.stop())
    const stored = await again.services.get(StorageProvider).runs.get("run-leftover")
    expect(stored?.status).toBe("interrupted")
  })
})

const tiny: import("@executioncontrolprotocol/protocol").ExecutionManifest = {
  schema: "@executioncontrolprotocol.execution",
  version: "2.0",
  steps: [{ id: "echo", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "out" }],
}