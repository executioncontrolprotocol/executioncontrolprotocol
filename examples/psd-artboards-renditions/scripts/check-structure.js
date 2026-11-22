// Structural check of the reflowed PSD against the plan, from the output document's manifest:
// every planned artboard exists at the planned size, holds the planned layers, and each text layer sits inside its
// artboard's margins. Also surfaces any ECP_ERROR layer the UXP script wrote.

const tolerance = 2
// Artboard: its own rect. Text: referenceFrame (real text bounds). Raster: compositeFrame.absolute (clipped extent).
const box = (layer) =>
  layer.artboard?.rect ||
  (layer.type === "text_layer" ? layer.referenceFrame : layer.compositeFrame?.absolute) ||
  layer.compositeDimensions
const flat = []
const walk = (layers, parent) => {
  for (const layer of layers || []) {
    flat.push({ layer, parent })
    walk(layer.layers || layer.children, layer)
  }
}
walk(input.manifest.layers, null)

const errors = flat.map(({ layer }) => layer.name).filter((name) => typeof name === "string" && name.startsWith("ECP_ERROR"))
// Diagnostics the UXP script left as hidden ECP_DEBUG layers, joined back in order.
const notes = flat
  .map(({ layer }) => layer.name)
  .filter((name) => typeof name === "string" && name.startsWith("ECP_DEBUG "))
  .sort()
  .map((name) => name.slice("ECP_DEBUG 00 ".length))
  .join("")
const problems = []

const artboards = input.plan.artboards.map((planned) => {
  const found = flat.find(({ layer }) => layer.name === planned.name && Array.isArray(layer.layers || layer.children))
  if (!found) {
    problems.push(`${planned.name}: artboard missing`)
    return { name: planned.name, found: false }
  }
  const group = found.layer
  const rect = box(group)
  const width = rect ? rect.right - rect.left : undefined
  const height = rect ? rect.bottom - rect.top : undefined
  if (width !== undefined && (Math.abs(width - planned.width) > tolerance || Math.abs(height - planned.height) > tolerance)) {
    problems.push(`${planned.name}: size ${width}x${height}, planned ${planned.width}x${planned.height}`)
  }
  const children = (group.layers || group.children).map((child) => {
    const b = box(child)
    const fontSize = child.text?.characterStyles?.[0]?.fontSize
    return {
      name: child.name,
      type: child.type,
      ...(b ? { left: b.left, top: b.top, right: b.right, bottom: b.bottom } : {}),
      ...(fontSize ? { fontSize } : {}),
    }
  })
  const expected = planned.layers.map((item) => item.name).sort().join(", ")
  const actual = children.map((child) => child.name).sort().join(", ")
  if (expected !== actual) problems.push(`${planned.name}: holds [${actual}], planned [${expected}]`)
  for (const item of planned.layers) {
    const child = children.find((c) => c.name === item.name)
    if (!child) {
      problems.push(`${planned.name}: layer ${item.name} missing`)
      continue
    }
    if (item.role === "text" && rect && child.left !== undefined) {
      const inside =
        child.left >= rect.left - tolerance &&
        child.top >= rect.top - tolerance &&
        child.right <= rect.right + tolerance &&
        child.bottom <= rect.bottom + tolerance
      if (!inside) problems.push(`${planned.name}: ${item.name} extends outside the artboard`)
      if (child.fontSize && Math.abs(child.fontSize - item.fontSize) > 1) {
        problems.push(`${planned.name}: ${item.name} is ${child.fontSize}pt, planned ${item.fontSize}pt`)
      }
    }
  }
  return { name: planned.name, found: true, width, height, children }
})

return {
  ok: errors.length === 0 && problems.length === 0,
  errors,
  problems,
  artboards,
  layerTypes: [...new Set(flat.map(({ layer }) => layer.type))],
  ...(notes ? { notes } : {}),
}
