import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { parseCsv } from "../../../../plugins/plugin-core/src/csv/parse-rfc4180.js"

const exampleDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../examples/psd-variants")

/** Run a transform script body the way core.transform does: `input` in, the returned value out. */
function script(name: string): (input: unknown) => unknown {
  const source = readFileSync(path.join(exampleDir, "scripts", name), "utf8")
  return new Function("input", source) as (input: unknown) => unknown
}

const checkVariants = script("check-variants.js")
const variantEdits = script("variant-edits.js")
const table = parseCsv(readFileSync(path.join(exampleDir, "variants.csv"), "utf8"))
const paths = ["backgrounds/beach.jpg", "backgrounds/city.jpg", "C:\\art\\forest.jpg"]

describe("psd-variants check-variants.js", () => {
  it("matches each row's background to a file by name", () => {
    const result = checkVariants({ table, backgroundPaths: paths }) as { rows: unknown[]; backgrounds: unknown[] }
    expect(result.rows).toHaveLength(3)
    expect(result.backgrounds).toEqual([
      { name: "beach.jpg", path: "backgrounds/beach.jpg" },
      { name: "city.jpg", path: "backgrounds/city.jpg" },
      { name: "forest.jpg", path: "C:\\art\\forest.jpg" },
    ])
  })

  it("lists a shared background once", () => {
    const shared = { ...table, rows: [...table.rows, { title: "Again", subtitle: "s", background: "beach.jpg" }] }
    const result = checkVariants({ table: shared, backgroundPaths: paths }) as { backgrounds: unknown[] }
    expect(result.backgrounds).toHaveLength(3)
  })

  it("names every missing file, and every other problem, at once", () => {
    const rows = [
      { title: "A", subtitle: "", background: "sky.jpg" },
      { title: "B", subtitle: "b", background: "sea.jpg" },
    ]
    expect(() => checkVariants({ table: { columns: table.columns, rows }, backgroundPaths: ["x/beach.jpg", "y/beach.jpg"] })).toThrow(
      /two background files share a name: beach\.jpg; row 1 has no subtitle; no background file named sky\.jpg, sea\.jpg/,
    )
  })

  it("requires the three columns and at least one row", () => {
    expect(() => checkVariants({ table: { columns: ["title"], rows: [] }, backgroundPaths: [] })).toThrow(
      /missing: subtitle, background/,
    )
    expect(() => checkVariants({ table: { columns: table.columns, rows: [] }, backgroundPaths: [] })).toThrow(/no rows/)
  })
})

describe("psd-variants variant-edits.js", () => {
  const manifest = {
    layers: [
      { id: 2, name: "Background", type: "layer" },
      { id: 3, name: "Headline", type: "text_layer" },
      { id: 4, name: "Subhead", type: "text_layer" },
    ],
  }
  const layers = { title: "Headline", subtitle: "Subhead", background: "Background" }
  const uploaded = [{ name: "beach.jpg", file: { kind: "url", url: "https://blob.test/beach.jpg" } }]
  const rows = [{ title: "Summer Sale", subtitle: "50% off", background: "beach.jpg" }]

  it("builds id- and type-addressed edits for the background and both texts", () => {
    expect(variantEdits({ rows, uploaded, manifest, layers })).toEqual({
      rows: [
        {
          title: "Summer Sale",
          subtitle: "50% off",
          background: "beach.jpg",
          edits: [
            {
              id: 2,
              type: "layer",
              operation: { type: "edit" },
              image: { kind: "url", url: "https://blob.test/beach.jpg" },
              transformMode: "fill",
            },
            { id: 3, type: "text_layer", operation: { type: "edit" }, text: { content: "Summer Sale" } },
            { id: 4, type: "text_layer", operation: { type: "edit" }, text: { content: "50% off" } },
          ],
        },
      ],
    })
  })

  it("fails on a missing layer or a layer of the wrong type, naming both", () => {
    expect(() =>
      variantEdits({ rows, uploaded, manifest, layers: { title: "Title", subtitle: "Background", background: "Headline" } }),
    ).toThrow(/no top-level layer named "Title".*layer "Background" is a layer, not a text layer; layer "Headline" is a text_layer, not a pixel layer/)
  })
})
