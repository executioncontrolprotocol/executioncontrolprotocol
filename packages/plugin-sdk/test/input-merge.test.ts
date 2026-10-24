import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { EcpCliError } from "../src/errors.js"
import { loadInputFile, mergeInput } from "../src/input-merge.js"

describe("mergeInput", () => {
  it("lets flags override --input fields", () => {
    const merged = mergeInput(
      { expression: "from-file", payload: { a: 1 } },
      { expression: "from-flag" },
      ["--expression", "from-flag"],
      ["expression", "payload"]
    )
    expect(merged).toEqual({ expression: "from-flag", payload: { a: 1 } })
  })

  it("does not apply flag defaults when the flag is absent", () => {
    const merged = mergeInput(
      { expression: "from-file" },
      { expression: "default" },
      [],
      ["expression"]
    )
    expect(merged.expression).toBe("from-file")
  })

  it("always applies positional args", () => {
    const merged = mergeInput(
      {},
      { query: "echo" },
      ["echo"],
      ["query"],
      ["query"]
    )
    expect(merged.query).toBe("echo")
  })

  it("reads camelCase keys from flagsAndArgs when the kebab key is absent", () => {
    const merged = mergeInput({}, { maxCostUsd: 2 }, ["--max-cost-usd", "2"], ["maxCostUsd"])
    expect(merged.maxCostUsd).toBe(2)
  })
})

describe("loadInputFile", () => {
  it("returns {} when the flag is omitted", async () => {
    expect(await loadInputFile(undefined)).toEqual({})
  })

  it("reads a JSON object from a file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ecp-input-"))
    const file = join(dir, "in.json")
    await writeFile(file, JSON.stringify({ expression: "$.a" }), "utf8")
    expect(await loadInputFile(file)).toEqual({ expression: "$.a" })
  })

  it("rejects missing files, invalid JSON and non-objects", async () => {
    await expect(loadInputFile(join(tmpdir(), "missing-ecp-input.json"))).rejects.toBeInstanceOf(EcpCliError)
    const dir = await mkdtemp(join(tmpdir(), "ecp-input-bad-"))
    const invalid = join(dir, "bad.json")
    await writeFile(invalid, "{", "utf8")
    await expect(loadInputFile(invalid)).rejects.toMatchObject({ code: "ECP_INPUT_INVALID" })
    const arrayFile = join(dir, "arr.json")
    await writeFile(arrayFile, "[1]", "utf8")
    await expect(loadInputFile(arrayFile)).rejects.toMatchObject({ code: "ECP_INPUT_INVALID" })
  })
})
