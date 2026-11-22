// Layout plan: the design decisions for each new artboard. This is the file to tune between runs.
//
// The plan says *what* to do (sizes, margins, how text scales, where the text block anchors, which layer is the
// background); the UXP script measures the real layers inside Photoshop and applies these rules. Measuring there
// matters: some PSDs report zero-size layers in their manifest, but Photoshop always knows the real bounds.
//
// Input: manifest (source document manifest), sizes ([{ name, width, height, rules? }]), rules (optional overrides).
// A size's own `rules` override the shared ones for that artboard only (a tall story and a small rectangle need
// different choices).
// Output: { source: { width, height, background, texts }, artboards: [{ name, x, y, width, height, ... }] }.

const rules = {
  margin: 0.08, // minimum space around the text block, as a share of the artboard's shorter side
  gap: 160, // horizontal space between artboards on the canvas
  textScale: 1, // multiplier on the text block's natural scale (min of the width and height ratios)
  maxTextWidth: 1, // the text block may use at most this share of the space inside the margins
  anchorX: "source", // "source" keeps the block's relative horizontal position; "left" | "center"
  anchorY: "source", // "source" keeps its relative vertical position; "top" | "center" | "bottom", or a number from 0 (top) to 1 (bottom) of the free space
  debug: false, // true: the UXP script leaves its measurements as hidden ECP_DEBUG layers (see structure.notes)
  ...(input.rules || {}),
}

const doc = input.manifest.document.bounds
const W = doc.right - doc.left
const H = doc.bottom - doc.top

const top = input.manifest.layers || []
const texts = top.filter((layer) => layer.type === "text_layer").map((layer) => layer.name)
// The background is the bottom-most non-text layer (manifest order is bottom to top).
const backgroundLayer = top.find((layer) => layer.type !== "text_layer" && layer.type !== "group")
if (texts.length === 0) throw new Error("The source PSD has no top-level text layers to reflow.")

let cursor = W + rules.gap
const artboards = input.sizes.map((size) => {
  const r = { ...rules, ...(size.rules || {}) }
  const artboard = {
    name: size.name,
    x: cursor,
    y: 0,
    width: size.width,
    height: size.height,
    margin: Math.round(r.margin * Math.min(size.width, size.height)),
    textScale: Math.round(Math.min(size.width / W, size.height / H) * r.textScale * 1000) / 1000,
    maxTextWidth: r.maxTextWidth,
    anchorX: r.anchorX,
    anchorY: r.anchorY,
    layers: [
      ...(backgroundLayer ? [{ name: backgroundLayer.name, role: "background" }] : []),
      ...texts.map((name) => ({ name, role: "text" })),
    ],
  }
  cursor += size.width + rules.gap
  return artboard
})

// What Photoshop writes back: the PSD and a preview of the whole canvas (keyed `psd` and `jpeg`).
// Per-artboard renditions would review better, but on UXP-script jobs Photoshop ignores an output's
// `layers`/`maxWidth`, and a script-written file (`scriptOutputPattern`) must land in an output folder the API
// doesn't document — an unmatched pattern fails the whole job. So: one canvas preview, at a fixed width.
const hosted = { validityPeriod: 86400 }
const outputs = [
  { destination: hosted, mediaType: "image/vnd.adobe.photoshop" },
  { destination: hosted, mediaType: "image/jpeg", width: 2400, quality: "high" },
]

return {
  source: { width: W, height: H, background: backgroundLayer ? backgroundLayer.name : null, texts },
  artboards,
  outputs,
  debug: rules.debug === true,
}
