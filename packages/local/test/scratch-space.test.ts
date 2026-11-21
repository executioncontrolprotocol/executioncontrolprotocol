import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { createEnvironment } from "@executioncontrolprotocol/engine"
import { ScratchSpace } from "@executioncontrolprotocol/protocol"
import { LocalScratchSpace } from "../src/storage/scratch-space.js"

describe("LocalScratchSpace", () => {
  it("writes scratch bytes and releases the step directory", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-scratch-"))
    const host = await createEnvironment().use(LocalScratchSpace, ScratchSpace).start({ home })
    const scratch = host.services.get(ScratchSpace)
    const source = path.join(home, "source.bin")
    await writeFile(source, Buffer.from([1, 2]))
    const copied = await scratch.copyFromPath("run-1", "step-a", source, "copy.bin")
    expect(await readFile(copied)).toEqual(Buffer.from([1, 2]))
    await scratch.releaseStep("run-1", "step-a")
    await expect(readFile(copied)).rejects.toThrow()
    await scratch.releaseStep("run-1", "step-a")
    const viaWrite = await scratch.writeBytes("run-1", "step-b", "w.bin", new Uint8Array([9]))
    expect(await readFile(viaWrite)).toEqual(Buffer.from([9]))
    await host.stop()
  })

  it("keeps nested-call step ids inside the run and apart from each other, and rejects unsafe names", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-scratch-nested-"))
    const host = await createEnvironment().use(LocalScratchSpace, ScratchSpace).start({ home })
    const scratch = host.services.get(ScratchSpace)
    const a = await scratch.writeBytes("run-1", "outer>@scope/plugin.a", "x.bin", new Uint8Array([1]))
    const b = await scratch.writeBytes("run-1", "outer>@scope/plugin-a", "x.bin", new Uint8Array([2]))
    const tmpRoot = path.join(home, "runs", "run-1", "tmp")
    for (const file of [a, b]) {
      expect(path.relative(tmpRoot, file).split(path.sep)).toHaveLength(2)
    }
    expect(a).not.toBe(b)
    const streamed = await scratch.writeStream("run-1", "s", "st.bin", new Response(new Uint8Array([5, 6])).body!)
    expect(await readFile(streamed)).toEqual(Buffer.from([5, 6]))
    await expect(scratch.writeBytes("run-1", "s", "../up.bin", new Uint8Array())).rejects.toMatchObject({
      code: "ECP_INPUT_INVALID",
    })
    await expect(scratch.writeBytes("../run", "s", "ok.bin", new Uint8Array())).rejects.toMatchObject({
      code: "ECP_INPUT_INVALID",
    })
    await host.stop()
  })
})