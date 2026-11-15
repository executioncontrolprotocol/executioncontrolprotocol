/**
 * UXP script for Photoshop Actions: rewrite every text layer in the active document.
 * The host syntax-checks this file via `$script.path` and never runs it locally —
 * Photoshop executes it after Firefly polls the job.
 *
 * Params:
 * - `texts`: optional map of layer name → new contents (preferred).
 * - `headline`: optional fallback applied to any text layer not listed in `texts`.
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
  // Photoshop UXP provides CommonJS `require` for the photoshop module.
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
