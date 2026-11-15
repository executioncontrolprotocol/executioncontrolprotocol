import { mkdirSync, writeFileSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { createLocalHost } from "../src/index.js"

const pluginTestRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../plugins/plugin-test",
)

describe("path $script validation", () => {
  it("validates relative $script.path using the execution directory", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-ops-script-"))
    const work = path.join(home, "flows")
    mkdirSync(work, { recursive: true })
    writeFileSync(path.join(work, "banner.js"), "const x = 1\n")
    const execPath = path.join(work, "scripted.ecp.json")
    writeFileSync(
      execPath,
      `${JSON.stringify(
        {
          schema: "@executioncontrolprotocol.execution",
          version: "2.0",
          steps: [
            {
              id: "scripted",
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

    const host = await createLocalHost({
      home,
      mode: "in-process",
      extraPlugins: [pluginTestRoot],
    })
    const result = await host.operations.execute({
      mode: "validate",
      execution: { path: execPath },
    })
    expect(result.ok).toBe(true)
    if (result.ok && "validation" in result.data) {
      expect(result.data.validation.valid).toBe(true)
      expect(result.data.validation.issues.filter((i) => i.severity === "error")).toEqual([])
    }

    writeFileSync(path.join(work, "banner.js"), "const (\n")
    const bad = await host.operations.execute({
      mode: "validate",
      execution: { path: execPath },
    })
    expect(bad.ok).toBe(false)
    if (!bad.ok) {
      expect(bad.error.issues?.some((i) => i.code === "ECP_SCRIPT_INVALID")).toBe(true)
    }
    await host.stop()
  })
})
