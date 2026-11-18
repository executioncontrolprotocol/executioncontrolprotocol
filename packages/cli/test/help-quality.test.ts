import { readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { Command, Flags } from "@oclif/core"
import { describe, expect, it } from "vitest"
import { checkCommandHelp } from "../src/lib/help-quality.js"

const commandsRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/commands")

async function loadCommandModules(dir: string, prefix = ""): Promise<Array<{ id: string; mod: { default: typeof Command } }>> {
  const entries = readdirSync(dir, { withFileTypes: true })
  const out: Array<{ id: string; mod: { default: typeof Command } }> = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    const nextPrefix = prefix ? `${prefix}:${entry.name}` : entry.name
    if (entry.isDirectory()) {
      out.push(...(await loadCommandModules(full, nextPrefix)))
      continue
    }
    const id = prefix ? `${prefix}:${entry.name.replace(/\.ts$/, "")}` : entry.name.replace(/\.ts$/, "")
    if (!entry.name.endsWith(".ts")) continue
    const mod = (await import(pathToFileURL(full).href)) as { default: typeof Command }
    out.push({ id, mod })
  }
  return out
}

describe("cli help quality", () => {
  it("every ECP command has description, examples, and flag text", async () => {
    const modules = await loadCommandModules(commandsRoot)
    const issues = modules.flatMap(({ id, mod }) => checkCommandHelp(id, mod.default))
    expect(issues).toEqual([])
  })

  it("rejects stubs missing examples or flag descriptions", () => {
    class BadExamples extends Command {
      static override description = "Bad"
      static override examples = [{ description: "x", command: "" }]
    }
    expect(checkCommandHelp("bad", BadExamples).some((row) => row.message.includes("empty command"))).toBe(true)

    class BadFlag extends Command {
      static override description = "Bad"
      static override examples = [{ description: "x", command: "ecp x" }]
      static override flags = {
        x: Flags.boolean(),
      }
    }
    expect(checkCommandHelp("bad-flag", BadFlag).some((row) => row.message.includes("flag"))).toBe(true)

    class GoodFlag extends Command {
      static override description = "Good"
      static override examples = [{ description: "x", command: "ecp good" }]
      static override flags = {
        yes: Flags.boolean({ description: "yes", default: false }),
      }
    }
    expect(checkCommandHelp("good", GoodFlag)).toEqual([])
  })

  it("rejects help text that points at internal specs", () => {
    class SpecRef extends Command {
      static override description = "Read things"
      static override examples = [{ description: "x", command: "ecp spec-ref" }]
      static override flags = {
        filter: Flags.string({ description: "Filter keys per spec 06." }),
      }
    }
    expect(checkCommandHelp("spec-ref", SpecRef).some((row) => row.message.includes("internal docs"))).toBe(true)
  })
})