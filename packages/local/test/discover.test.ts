import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { discoverPluginRoots } from "../src/index.js"

describe("discoverPluginRoots", () => {
  let tempRoot: string

  beforeAll(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "ecp-discover-"))
  })

  afterAll(async () => {
    // temp dirs are cleaned by the OS; keep the suite hermetic by not sharing state
  })

  it("reads user dependencies and link records from an oclif-shaped data dir", async () => {
    const dataDir = path.join(tempRoot, "data")
    const linked = path.join(tempRoot, "linked-plugin")
    await mkdir(path.join(dataDir, "node_modules/@scope/plugin-user"), { recursive: true })
    await mkdir(linked, { recursive: true })
    await writeFile(
      path.join(dataDir, "package.json"),
      JSON.stringify({
        dependencies: { "@scope/plugin-user": "1.0.0" },
        oclif: {
          plugins: [
            "@scope/plugin-user",
            { type: "link", name: "@scope/plugin-linked", root: linked },
            { name: "@scope/plugin-named" },
          ],
        },
      }),
    )
    await mkdir(path.join(dataDir, "node_modules/@scope/plugin-named"), { recursive: true })

    const roots = await discoverPluginRoots({
      dataDir,
      extraPlugins: [path.join(tempRoot, "extra")],
    })
    const bySource = Object.groupBy(roots, (item) => item.source)
    expect(bySource.user?.map((item) => path.basename(item.root)).sort()).toEqual([
      "plugin-named",
      "plugin-user",
    ])
    expect(bySource.link?.map((item) => item.root)).toEqual([path.resolve(linked)])
    expect(bySource.core?.map((item) => item.root)).toEqual([path.resolve(tempRoot, "extra")])
  })

  it("tolerates a missing data-dir package.json", async () => {
    const roots = await discoverPluginRoots({
      dataDir: path.join(tempRoot, "absent"),
      extraPlugins: [path.join(tempRoot, "only-extra")],
    })
    expect(roots).toEqual([
      { root: path.resolve(tempRoot, "only-extra"), source: "core" },
    ])
  })
})
