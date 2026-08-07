import { describe, expect, it, beforeAll } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import Ajv from "ajv"

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const schemasDir = join(pkgRoot, "dist", "schemas")

function loadSchema(name: string): object {
  const path = join(schemasDir, name)
  if (!existsSync(path)) {
    throw new Error(`Schema not found: ${path}. Run npm run generate:schema first.`)
  }
  return JSON.parse(readFileSync(path, "utf8")) as object
}

describe("generated JSON schemas", () => {
  const ajv = new Ajv({ strict: false, allErrors: true })
  let workflowSchemaId: string

  beforeAll(() => {
    const workflowSchema = loadSchema("workflow.manifest.json") as { $id: string }
    workflowSchemaId = workflowSchema.$id
    ajv.addSchema(workflowSchema)
  })

  it("validates example workflow fixture", () => {
    const valid = JSON.parse(
      readFileSync(join(pkgRoot, "test", "fixtures", "workflow.valid.json"), "utf8")
    )
    expect(ajv.validate(workflowSchemaId, valid)).toBe(true)
  })

  it("rejects invalid workflow fixture", () => {
    const invalid = JSON.parse(
      readFileSync(join(pkgRoot, "test", "fixtures", "workflow.invalid.json"), "utf8")
    )
    expect(ajv.validate(workflowSchemaId, invalid)).toBe(false)
  })

  it("validates repo example 01-echo workflow.json when present", () => {
    const echoPath = join(pkgRoot, "..", "..", "examples", "01-echo", "workflow.json")
    if (!existsSync(echoPath)) return
    const doc = JSON.parse(readFileSync(echoPath, "utf8"))
    expect(ajv.validate(workflowSchemaId, doc)).toBe(true)
  })
})
