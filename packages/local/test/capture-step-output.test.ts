import { ArtifactStore, DEFAULT_FILE_MAX_BYTES_SETTINGS, ScratchSpace, artifactUri } from "@executioncontrolprotocol/protocol"
// Engine source by relative path (as other cross-package tests do) so its capture code counts toward coverage.
import type { ServiceLookup } from "../../engine/src/container/environment.js"
import { captureStepOutput, type CaptureOneDelegate } from "../../engine/src/execute/capture-output.js"
import { MemoryArtifactStore, MemoryScratchSpace } from "../../engine/src/testing/index.js"
import { createCaptureOneDelegate } from "../src/plugins/capture-output.js"
import { createServer } from "node:http"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
])

let urlBase = ""
let filePath = ""
let urlServer: ReturnType<typeof createServer> | undefined

beforeAll(async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ecp-cap-"))
  filePath = path.join(dir, "sample.png")
  await writeFile(filePath, PNG)
  urlServer = createServer((req, res) => {
    if (req.url === "/img.png") {
      res.writeHead(200, { "Content-Type": "image/png" })
      res.end(Buffer.from(PNG))
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((resolve) => urlServer!.listen(0, "127.0.0.1", () => resolve()))
  const address = urlServer.address()
  if (!address || typeof address === "string") throw new Error("listen failed")
  urlBase = `http://127.0.0.1:${address.port}/img.png`
})

afterAll(async () => {
  await new Promise<void>((resolve) => urlServer?.close(() => resolve()))
})

function captureDelegate(runId: string, captureMax = DEFAULT_FILE_MAX_BYTES_SETTINGS.capture) {
  const artifacts = new MemoryArtifactStore()
  const scratch = new MemoryScratchSpace()
  const lookup: ServiceLookup = {
    get(token) {
      if (token === ArtifactStore) return artifacts as never
      if (token === ScratchSpace) return scratch as never
      throw new Error(`unexpected service ${token.id}`)
    },
    getAll: () => [],
    has: (token) => token === ArtifactStore || token === ScratchSpace,
  }
  const delegate = createCaptureOneDelegate(lookup, { ...DEFAULT_FILE_MAX_BYTES_SETTINGS, capture: captureMax })
  return { delegate, artifacts, runId }
}

describe("uniform capture", () => {
  it("captures url, file, and artifact kinds with archive and matching bytes", async () => {
    const runId = "run-cap-pos"
    const { delegate, artifacts } = captureDelegate(runId)
    await artifacts.put(runId, "pre.png", PNG, { mediaType: "image/png" })
    const output = {
      u: { kind: "url" as const, url: urlBase, mediaType: "image/png" },
      f: { kind: "file" as const, path: filePath, mediaType: "image/png" },
      a: {
        kind: "artifact" as const,
        uri: artifactUri(runId, "pre.png"),
        mediaType: "image/png",
        name: "pre.png",
      },
    }
    const result = await captureStepOutput(output, {
      stepId: "cap",
      persist: true,
      runId,
      delegate,
    })
    expect(result.captured).toHaveLength(3)
    expect(output.u.kind).toBe("url")
    expect(output.u.archive?.name).toBeDefined()
    expect(output.f.archive?.name).toBeDefined()
    expect(output.a.archive?.uri).toBe(output.a.uri)
    const uBytes = await artifacts.getBytes(runId, output.u.archive!.name!)
    expect(uBytes).toEqual(PNG)
    const fBytes = await artifacts.getBytes(runId, output.f.archive!.name!)
    expect(fBytes).toEqual(PNG)
    for (const row of result.captured) {
      expect(row.error).toBeUndefined()
      expect(row.artifact).toBeDefined()
    }
  })

  it("records fetch errors and emits warnings without archive", async () => {
    const runId = "run-cap-err"
    const { delegate } = captureDelegate(runId)
    const output = { u: { kind: "url" as const, url: "http://127.0.0.1:9/missing" } }
    const codes: string[] = []
    const result = await captureStepOutput(output, {
      stepId: "x",
      persist: true,
      runId,
      delegate,
      onWarning: (issue) => codes.push(issue.code),
    })
    expect(result.captured[0]?.error).toBeDefined()
    expect(output.u.archive).toBeUndefined()
    expect(codes.length).toBeGreaterThan(0)
  })

  it("records over-cap as error", async () => {
    const runId = "run-cap-size"
    const { delegate } = captureDelegate(runId, 4)
    const output = { u: { kind: "url" as const, url: urlBase } }
    const result = await captureStepOutput(output, { stepId: "x", persist: true, runId, delegate })
    expect(result.captured[0]?.error).toBeDefined()
    expect(output.u.archive).toBeUndefined()
  })

  it("skips when persist is false", async () => {
    const runId = "run-cap-skip"
    const { delegate } = captureDelegate(runId)
    const output = { u: { kind: "url" as const, url: urlBase } }
    const result = await captureStepOutput(output, { stepId: "x", persist: false, runId, delegate })
    expect(result.captured).toHaveLength(0)
    expect(output.u.archive).toBeUndefined()
  })

  it("assigns unique artifact names for duplicate urls", async () => {
    const runId = "run-cap-dup"
    const { delegate } = captureDelegate(runId)
    const output = {
      a: { kind: "url" as const, url: urlBase, mediaType: "image/png" },
      b: { kind: "url" as const, url: urlBase, mediaType: "image/png" },
    }
    await captureStepOutput(output, { stepId: "dup", persist: true, runId, delegate })
    expect(output.a.archive?.name).not.toBe(output.b.archive?.name)
  })

  it("keeps each loop round's captures apart", async () => {
    const runId = "run-cap-rounds"
    const { delegate, artifacts } = captureDelegate(runId)
    const names: string[] = []
    for (const round of [1, 2]) {
      const output = { image: { kind: "url" as const, url: urlBase, mediaType: "image/png" } }
      await captureStepOutput(output, { stepId: "render", round, persist: true, runId, delegate })
      names.push(output.image.archive!.name!)
    }
    expect(names[0]).toContain("render-r1")
    expect(names[1]).toContain("render-r2")
    expect((await artifacts.list(runId)).map((item) => item.name).sort()).toEqual([...names].sort())
  })

  it("streams the source into the store instead of reading it whole", async () => {
    const runId = "run-cap-stream"
    const { delegate, artifacts } = captureDelegate(runId)
    const puts: Array<ReadableStream<Uint8Array> | Uint8Array> = []
    const put = artifacts.put.bind(artifacts)
    artifacts.put = async (id, name, body, options) => {
      puts.push(body)
      return put(id, name, body, options)
    }
    const output = { file: { kind: "file" as const, path: filePath } }
    await captureStepOutput(output, { stepId: "s", persist: true, runId, delegate })
    expect(puts).toHaveLength(1)
    expect(puts[0]).toBeInstanceOf(ReadableStream)
    expect(await artifacts.getBytes(runId, output.file.archive!.name!)).toEqual(PNG)
  })

  it("walks nested refs", async () => {
    const runId = "run-cap-nested"
    const { delegate } = captureDelegate(runId)
    const output = { group: { files: [{ kind: "url" as const, url: urlBase }] } }
    const result = await captureStepOutput(output, { stepId: "n", persist: true, runId, delegate })
    expect(result.captured[0]?.path).toBe("group/files/0")
  })

  it("records an existing archive without calling the delegate", async () => {
    const runId = "run-cap-arch"
    let calls = 0
    const archive = {
      kind: "artifact" as const,
      uri: artifactUri(runId, "kept.png"),
      name: "kept.png",
      mediaType: "image/png",
    }
    const output = { u: { kind: "url" as const, url: urlBase, archive } }
    const result = await captureStepOutput(output, {
      stepId: "x",
      persist: true,
      runId,
      delegate: async () => {
        calls += 1
        throw new Error("delegate should not run")
      },
    })
    expect(calls).toBe(0)
    expect(result.captured[0]?.artifact?.name).toBe("kept.png")
  })

  it("returns unchanged when delegate is omitted", async () => {
    const output = { u: { kind: "url" as const, url: urlBase } }
    const result = await captureStepOutput(output, { stepId: "x", persist: true, runId: "r", delegate: undefined })
    expect(result.captured).toEqual([])
  })

  it("passes executionDir to the delegate for relative file refs", async () => {
    const runId = "run-cap-execdir"
    let seenDir: string | undefined
    const delegate: CaptureOneDelegate = async (input) => {
      seenDir = input.executionDir
      const archive = { kind: "artifact" as const, uri: artifactUri(runId, input.artifactName), name: input.artifactName }
      ;(input.ref as { archive?: typeof archive }).archive = archive
      return { record: { path: input.outputPath, source: { kind: "file", path: input.ref.path }, artifact: archive } }
    }
    const dir = path.dirname(filePath)
    const relative = { kind: "file" as const, path: path.basename(filePath) }
    await captureStepOutput({ relative }, { stepId: "x", persist: true, runId, delegate, executionDir: dir })
    expect(seenDir).toBe(dir)
  })

  it("derives artifact names from file paths", async () => {
    const runId = "run-cap-name"
    const { delegate } = captureDelegate(runId)
    const fileOut = { kind: "file" as const, path: filePath, mediaType: "image/png" }
    await captureStepOutput({ fileOut }, { stepId: "n1", persist: true, runId, delegate })
    expect(fileOut.archive?.name).toContain("sample.png")
  })

  it("invokes onWarning when the delegate records an error", async () => {
    const warnings: string[] = []
    const runId = "run-cap-warn-fn"
    const output = { u: { kind: "url" as const, url: "http://127.0.0.1:9/missing" } }
    await captureStepOutput(output, {
      stepId: "w",
      persist: true,
      runId,
      delegate: captureDelegate(runId).delegate,
      onWarning: (issue) => warnings.push(issue.code),
    })
    expect(warnings.length).toBeGreaterThan(0)
  })

  it("uses download as the url name hint when the url is not parseable", async () => {
    const runId = "run-cap-hint"
    const { delegate } = captureDelegate(runId)
    const oddUrl = { kind: "url" as const, url: "not-a-valid-url", mediaType: "image/png" }
    const result = await captureStepOutput({ oddUrl }, { stepId: "hint", persist: true, runId, delegate })
    expect(result.captured[0]?.error).toBeDefined()
    expect(result.captured[0]?.artifact).toBeUndefined()
  })

  it("names captures from each kind's source and keeps names unique without extensions", async () => {
    const names: string[] = []
    const fake: CaptureOneDelegate = async (input) => {
      names.push(input.artifactName)
      return { record: { path: input.outputPath, source: { kind: input.ref.kind } } }
    }
    const output = {
      a: { kind: "url" as const, url: "https://cdn.test/noext" },
      b: { kind: "url" as const, url: "https://cdn.test/noext" },
      c: { kind: "url" as const, url: "https://cdn.test/noext" },
      d: { kind: "file" as const, path: "/tmp/dir/" },
      e: { kind: "artifact" as const, uri: "ecp://runs/r/artifacts/x" },
    }
    await captureStepOutput(output, { stepId: "n", persist: true, runId: "run-names", delegate: fake })
    expect(new Set(names).size).toBe(5)
    expect(names.slice(0, 3)).toEqual(["n-a-noext", "n-b-noext", "n-c-noext"])
    expect(names[3]).toBe("n-d-file")
    expect(names[4]).toBe("n-e-artifact")
  })

  it("adds an extension from the media type when the source name has none", async () => {
    const names: string[] = []
    const fake: CaptureOneDelegate = async (input) => {
      names.push(input.artifactName)
      return { record: { path: input.outputPath, source: { kind: input.ref.kind } } }
    }
    const output = {
      jpeg: { kind: "url" as const, url: "https://cdn.test/4d4bfe41?sig=1", mediaType: "image/jpeg" },
      png: { kind: "url" as const, url: "https://cdn.test/shot.png", mediaType: "image/png" },
      odd: { kind: "url" as const, url: "https://cdn.test/blob", mediaType: "application/x-custom" },
    }
    await captureStepOutput(output, { stepId: "ext", persist: true, runId: "run-ext", delegate: fake })
    expect(names).toEqual(["ext-jpeg-4d4bfe41.jpg", "ext-png-shot.png", "ext-odd-blob"])
  })

  it("de-duplicates names at the same output path and leaves an undefined output alone", async () => {
    const names: string[] = []
    const fake: CaptureOneDelegate = async (input) => {
      names.push(input.artifactName)
      return { record: { path: input.outputPath, source: { kind: input.ref.kind } } }
    }
    const list = [
      { kind: "url" as const, url: "https://cdn.test/same.png" },
      { kind: "url" as const, url: "https://cdn.test/same.png" },
    ]
    await captureStepOutput(list, { stepId: "dup", persist: true, runId: "run-dupe", delegate: fake })
    expect(new Set(names).size).toBe(2)
    expect(await captureStepOutput(undefined, { stepId: "u", persist: true, runId: "r", delegate: fake })).toEqual({
      output: undefined,
      captured: [],
    })
  })

  it("records store failures without a code as provider errors and keeps going", async () => {
    const runId = "run-cap-storefail"
    const { delegate, artifacts } = captureDelegate(runId)
    artifacts.put = async () => {
      throw new Error("disk full")
    }
    const output = {
      first: { kind: "file" as const, path: filePath },
      second: { kind: "artifact" as const, uri: artifactUri("run-other", "kept.bin") },
    }
    const result = await captureStepOutput(output, { stepId: "f", persist: true, runId, delegate })
    expect(result.captured[0]?.error).toEqual({ code: "ECP_PROVIDER_ERROR", message: "disk full" })
    expect(output.first).not.toHaveProperty("archive")
    expect(result.captured[1]?.artifact?.uri).toBe(artifactUri("run-other", "kept.bin"))
  })
})