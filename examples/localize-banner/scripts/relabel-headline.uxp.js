/**
 * @deprecated Use {@link ./relabel-text-layers.uxp.js} — kept so older paths keep working.
 * Rewrites every text layer (not only a layer named "Headline").
 */
const texts =
  typeof params !== "undefined" && params && typeof params.texts === "object" && params.texts !== null
    ? params.texts
    : {}
const headline =
  typeof params !== "undefined" && params && params.headline !== undefined && params.headline !== null
    ? String(params.headline)
    : undefined

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- UXP host API
  const photoshop = require("photoshop")
  const doc = photoshop.app.activeDocument
  const LayerKind = photoshop.constants.LayerKind

  function isTextLayer(layer) {
    if (!layer) return false
    if (LayerKind && layer.kind === LayerKind.TEXT) return true
    return layer.kind === "text" || layer.kind === "TEXT"
  }

  function isGroupLayer(layer) {
    if (!layer) return false
    if (LayerKind && layer.kind === LayerKind.GROUP) return true
    return layer.kind === "group" || layer.kind === "GROUP" || Boolean(layer.layers)
  }

  function replacementFor(layer) {
    if (Object.prototype.hasOwnProperty.call(texts, layer.name)) return String(texts[layer.name])
    if (headline !== undefined) return headline
    return undefined
  }

  function walk(layers) {
    if (!layers) return
    const list = typeof layers.length === "number" ? Array.from(layers) : []
    for (const layer of list) {
      if (isTextLayer(layer) && layer.textItem) {
        const next = replacementFor(layer)
        if (next !== undefined) layer.textItem.contents = next
      }
      if (isGroupLayer(layer) && layer.layers) walk(layer.layers)
    }
  }

  walk(doc.layers)
} catch (error) {
  console.error(error)
}
