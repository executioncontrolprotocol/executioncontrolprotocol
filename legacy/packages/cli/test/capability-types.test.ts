import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { Registry, defineExtension, capabilityFor } from "@executioncontrolprotocol/core"
import { z } from "zod"
import {
  ECP_TSCONFIG_MARKER,
  ecpTypesCacheDir,
  renderCapabilityInputsDts,
  writeEditorTsconfig,
  writeGlobalCapabilityTypes,
} from "../src/lib/capability-types.js"

describe("capability types cache", () => {
  const temps: string[] = []

  afterEach(async () => {
    await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it("renders CapabilityInputs entries from Zod schemas", async () => {
    const registry = new Registry()
    await registry.registerExtension(
      defineExtension("@executioncontrolprotocol", "demo")
        .withCapabilities([
          capabilityFor("@executioncontrolprotocol/demo", "echo")
            .withInput(z.object({ value: z.string(), count: z.number().optional() }))
            .withOutput(z.object({}))
            .withHandler(async () => ({})),
        ])
        .build()
    )
    const dts = renderCapabilityInputsDts(registry)
    expect(dts).toContain('"@executioncontrolprotocol/demo.echo"')
    expect(dts).toContain('"value": import("@executioncontrolprotocol/core/types").InputValue')
    expect(dts).toContain('"count"?: import("@executioncontrolprotocol/core/types").InputValue')
  })

  it("writes capabilities.d.ts and a core junction under the types dir", async () => {
    const typesDir = await mkdtemp(join(tmpdir(), "ecp-types-"))
    temps.push(typesDir)
    const registry = new Registry()
    await registry.registerExtension(
      defineExtension("@executioncontrolprotocol", "demo")
        .withCapabilities([
          capabilityFor("@executioncontrolprotocol/demo", "echo")
            .withInput(z.object({ value: z.string() }))
            .withOutput(z.object({}))
            .withHandler(async () => ({})),
        ])
        .build()
    )
    const written = writeGlobalCapabilityTypes({ registry, typesDir })
    expect(written.capabilitiesPath).toBe(join(typesDir, "capabilities.d.ts"))
    const body = await readFile(written.capabilitiesPath, "utf8")
    expect(body).toContain("CapabilityInputs")
    expect(existsSync(written.coreLink)).toBe(true)
  })

  it("writeEditorTsconfig is opt-in and skips hand-written tsconfig", async () => {
    const project = await mkdtemp(join(tmpdir(), "ecp-tsconfig-"))
    temps.push(project)
    const typesDir = join(project, "types-cache")
    await mkdir(typesDir, { recursive: true })

    const first = writeEditorTsconfig({ cwd: project, typesDir })
    expect(first.status).toBe("written")
    const body = await readFile(first.path, "utf8")
    expect(body).toContain(ECP_TSCONFIG_MARKER)
    expect(body).toContain(typesDir.replace(/\\/g, "/"))

    const refreshed = writeEditorTsconfig({ cwd: project, typesDir })
    expect(refreshed.status).toBe("refreshed")

    await writeFile(join(project, "tsconfig.json"), '{ "compilerOptions": {} }\n', "utf8")
    const skipped = writeEditorTsconfig({ cwd: project, typesDir })
    expect(skipped.status).toBe("skipped")
  })

  it("ecpTypesCacheDir uses ECP_CACHE_DIR", () => {
    const dir = ecpTypesCacheDir({ ECP_CACHE_DIR: "C:\\tmp\\ecp-cache" }, "C:\\unused")
    expect(dir.replace(/\\/g, "/")).toMatch(/ecp-cache\/types$/)
  })
})
