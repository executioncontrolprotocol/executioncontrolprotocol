// The Photoshop edits for each variant: swap the background image and set the two texts.
//
// Input: rows (checked CSV rows), uploaded ([{ name, file }] — each background's published URL), manifest (the
// template's layer document), layers ({ title, subtitle, background } — template layer names).
// Output: { rows: [{ title, subtitle, background, edits }] } where edits is create-composite's `edits.layers`.
// Layers are addressed by id and type (Photoshop requires both), looked up by name in the template; a missing layer fails here, before any job.

const top = input.manifest.layers || []
const find = (name, test, kind) => {
  const layer = top.find((candidate) => candidate.name === name)
  if (!layer) return `no top-level layer named "${name}" (layers: ${top.map((l) => l.name).join(", ")})`
  if (!test(layer)) return `layer "${name}" is a ${layer.type}, not a ${kind}`
  return layer
}
const title = find(input.layers.title, (l) => l.type === "text_layer", "text layer")
const subtitle = find(input.layers.subtitle, (l) => l.type === "text_layer", "text layer")
const background = find(input.layers.background, (l) => l.type === "layer" || l.type === "background_layer", "pixel layer")
const problems = [title, subtitle, background].filter((found) => typeof found === "string")
if (problems.length > 0) throw new Error(`The template doesn't fit the variants: ${problems.join("; ")}.`)

const urls = {}
for (const item of input.uploaded) urls[item.name] = item.file

return {
  rows: input.rows.map((row) => ({
    title: row.title,
    subtitle: row.subtitle,
    background: row.background,
    edits: [
      { id: background.id, type: background.type, operation: { type: "edit" }, image: urls[row.background], transformMode: "fill" },
      { id: title.id, type: title.type, operation: { type: "edit" }, text: { content: row.title } },
      { id: subtitle.id, type: subtitle.type, operation: { type: "edit" }, text: { content: row.subtitle } },
    ],
  })),
}
