/**
 * UXP script for Photoshop Actions: build the planned artboards (from plan-layout.js) in the active document.
 * The plan holds the rules; this script measures the real layers and applies them. For each artboard it copies the
 * source layers in, scales the background to cover the artboard, and scales the text block (keeping the spacing
 * and alignment between text layers) and anchors it inside the margins.
 *
 * Params: `plan` — { source: { width, height, background, texts }, artboards: [{ name, x, y, width, height,
 * margin, textScale, maxTextWidth, anchorX, anchorY, layers: [{ name, role }] }], debug }.
 *
 * Lessons from the runs that built this example (none of them obvious from the API):
 * - The first artboard in a plain document takes every existing layer, so it is made on purpose: "Original", at
 *   the source size. Later artboards are made with nothing selected, so they start empty.
 * - A layer with the "artboard auto-nest" lock (common on backgrounds) doesn't follow into that first artboard;
 *   it is moved in explicitly.
 * - `activeLayers[0]` after creating an artboard is not reliably the artboard; find it by diffing layer ids.
 * - Photoshop can re-base artboard positions, so layers are placed relative to each artboard's actual rectangle.
 * - Some PSDs report zero-size layers in their manifest, and text written by some tools has no layout until it is
 *   edited; re-setting a text layer's contents makes `layer.bounds` real.
 * - Copies keep the source's locks, and a position lock silently blocks every move and transform: unlock first.
 * - The DOM `layer.scale()` is a no-op in the cloud runtime; Free Transform through batchPlay works.
 * - `PLACEINSIDE` puts a copy at the top of the artboard, so copy bottom-to-top.
 *
 * A cloud script has no console the caller can read, so a failure is recorded as a hidden text layer named
 * `ECP_ERROR …`, and with `plan.debug` the measurements as hidden `ECP_DEBUG` layers; the workflow's structure
 * check reports both.
 */
const plan = typeof params !== "undefined" && params && params.plan ? params.plan : { artboards: [] }

const photoshop = require("photoshop")
const { app, action, core, constants } = photoshop

const debug = []

async function reflow() {
  const doc = app.activeDocument
  // The background's natural size, measured before any artboard can clip it.
  const bgSource = doc.layers.find((layer) => layer.name === plan.source.background)
  const bgNatural = bgSource ? size(bgSource.bounds) : undefined
  debug.push({ bgBefore: bgSource && bgSource.bounds })
  const original = await makeArtboard(
    doc,
    { name: "Original", x: 0, y: 0, width: plan.source.width, height: plan.source.height },
    false,
  )
  // Not every layer follows into the Original artboard (a locked or oversized background can stay at the top
  // level); move any that stayed outside into it, at the bottom, so Original matches the source document.
  for (const layer of [...doc.layers]) {
    if (layer.id === original.group.id) continue
    await layer.move(original.group, constants.ElementPlacement.PLACEINSIDE)
    const children = original.group.layers
    if (children.length > 1) await layer.move(children[children.length - 1], constants.ElementPlacement.PLACEAFTER)
  }
  const sources = {}
  for (const layer of original.group.layers) sources[layer.name] = layer
  debug.push({ originalRect: original.rect, bgAfter: sources[plan.source.background] && sources[plan.source.background].bounds })

  // Measure the text block (all text layers together) relative to the original artboard.
  const textNames = plan.source.texts
  const measured = textNames.map((name) => {
    const layer = sources[name]
    if (!layer) throw new Error(`text layer ${name} not found`)
    // Text written by some tools has no rendered data, so its bounds read as zero until the text is edited.
    // Re-setting the contents makes Photoshop lay it out.
    const contents = layer.textItem.contents
    layer.textItem.contents = contents
    return { name, layer, b: rel(layer.bounds, original.rect), size: layer.textItem.characterStyle.size }
  })
  const block = {
    left: Math.min(...measured.map((m) => m.b.left)),
    top: Math.min(...measured.map((m) => m.b.top)),
    right: Math.max(...measured.map((m) => m.b.right)),
    bottom: Math.max(...measured.map((m) => m.b.bottom)),
  }
  const blockW = block.right - block.left
  const blockH = block.bottom - block.top
  if (!(blockW > 0 && blockH > 0)) {
    throw new Error(`text block has no size: ${JSON.stringify(measured.map((x) => ({ name: x.name, b: x.b, size: x.size })))}`)
  }
  const W = plan.source.width
  const H = plan.source.height

  for (const artboard of plan.artboards) {
    const { group, rect } = await makeArtboard(doc, artboard, true)
    const w = rect.right - rect.left
    const h = rect.bottom - rect.top
    const m = artboard.margin

    const k = Math.min(artboard.textScale, ((w - 2 * m) * artboard.maxTextWidth) / blockW, (h - 2 * m) / blockH)
    const bw = blockW * k
    const bh = blockH * k
    const left =
      artboard.anchorX === "center" ? (w - bw) / 2 : artboard.anchorX === "left" ? m : clamp((block.left / W) * w, m, w - m - bw)
    const top =
      typeof artboard.anchorY === "number"
        ? m + (h - 2 * m - bh) * clamp(artboard.anchorY, 0, 1)
        : artboard.anchorY === "center"
        ? (h - bh) / 2
        : artboard.anchorY === "top"
          ? m
          : artboard.anchorY === "bottom"
            ? h - m - bh
            : clamp((block.top / H) * h, m, h - m - bh)

    // Plan order is bottom to top, and PLACEINSIDE puts each copy at the top of the artboard, so copying in plan
    // order leaves the background at the bottom and the text above it.
    for (const item of artboard.layers) {
      const source = sources[item.name]
      if (!source) throw new Error(`layer ${item.name} not found`)
      const copy = await source.duplicate(group, constants.ElementPlacement.PLACEINSIDE)
      copy.name = item.name
      // Copies inherit the source's locks; a position lock (common on backgrounds) silently blocks every
      // move and transform, so clear the locks on the copy before placing it.
      unlock(copy)
      if (item.role === "background") {
        // Scale from the natural size: inside an artboard, bounds may be clipped to the artboard.
        const natural = bgNatural || size(copy.bounds)
        const s = Math.max(w / natural.width, h / natural.height) * 101 // 1% bleed avoids edge seams
        await scaleLayer(copy, s)
        debug.push({ artboard: artboard.name, s: Math.round(s), after: copy.bounds })
        const c = copy.bounds
        await copy.translate(rect.left + w / 2 - (c.left + c.right) / 2, rect.top + h / 2 - (c.top + c.bottom) / 2)
      } else {
        const src = measured.find((x) => x.name === item.name)
        copy.textItem.characterStyle.size = Math.max(6, Math.round(src.size * k))
        const c = copy.bounds
        const targetLeft = rect.left + left + (src.b.left - block.left) * k
        const targetTop = rect.top + top + (src.b.top - block.top) * k
        await copy.translate(Math.round(targetLeft - c.left), Math.round(targetTop - c.top))
      }
    }
  }
}

/**
 * Scale a layer about its centre by `percent`. The DOM `layer.scale()` is a silent no-op in Photoshop's cloud
 * runtime (bounds unchanged), so this selects the layer and runs Free Transform through batchPlay.
 */
async function scaleLayer(layer, percent) {
  await action.batchPlay(
    [
      { _obj: "select", _target: [{ _ref: "layer", _id: layer.id }], makeVisible: false },
      {
        _obj: "transform",
        _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }],
        freeTransformCenterState: { _enum: "quadCenterState", _value: "QCSAverage" },
        width: { _unit: "percentUnit", _value: percent },
        height: { _unit: "percentUnit", _value: percent },
        linked: true,
        interfaceIconFrameDimmed: { _enum: "interpolationType", _value: "bicubic" },
      },
    ],
    {},
  )
}

function unlock(layer) {
  for (const flag of ["allLocked", "positionLocked", "pixelsLocked", "transparentPixelsLocked"]) {
    try {
      if (layer[flag]) layer[flag] = false
    } catch (_) {
      // not every layer kind has every lock
    }
  }
}

function size(b) {
  return { width: b.right - b.left, height: b.bottom - b.top }
}

function rel(b, rect) {
  return { left: b.left - rect.left, top: b.top - rect.top, right: b.right - rect.left, bottom: b.bottom - rect.top }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max))
}

async function makeArtboard(doc, artboard, empty) {
  await action.batchPlay(
    [{ _obj: empty ? "selectNoLayers" : "selectAllLayers", _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }] }],
    {},
  )
  const before = new Set(doc.layers.map((layer) => layer.id))
  await action.batchPlay(
    [
      {
        _obj: "make",
        _target: [{ _ref: "artboardSection" }],
        artboardRect: {
          _obj: "classFloatRect",
          top: artboard.y,
          left: artboard.x,
          bottom: artboard.y + artboard.height,
          right: artboard.x + artboard.width,
        },
      },
    ],
    {},
  )
  const group = doc.layers.find((layer) => !before.has(layer.id))
  if (!group) throw new Error(`artboard ${artboard.name} was not created`)
  group.name = artboard.name
  const [info] = await action.batchPlay([{ _obj: "get", _target: [{ _ref: "layer", _id: group.id }] }], {})
  const r = info && info.artboard && info.artboard.artboardRect
  const rect = r
    ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    : { left: artboard.x, top: artboard.y, right: artboard.x + artboard.width, bottom: artboard.y + artboard.height }
  return { group, rect }
}

async function reportError(error) {
  try {
    const doc = app.activeDocument
    const message = String((error && error.message) || error).slice(0, 200)
    const layer = await doc.createTextLayer({ contents: "x", fontSize: 12, position: { x: 0, y: 12 } })
    layer.name = `ECP_ERROR ${message}`
    layer.visible = false
  } catch (_) {
    // nothing else can report it
  }
}

/** Diagnostics for the agent: hidden `ECP_DEBUG` layers (names are length-limited, so long notes are split). */
async function reportDebug() {
  if (!plan.debug || debug.length === 0) return
  try {
    const doc = app.activeDocument
    const text = JSON.stringify(debug)
    for (let i = 0; i < text.length && i < 2400; i += 240) {
      const layer = await doc.createTextLayer({ contents: "x", fontSize: 12, position: { x: 0, y: 12 } })
      layer.name = `ECP_DEBUG ${String(i / 240).padStart(2, "0")} ${text.slice(i, i + 240)}`
      layer.visible = false
    }
  } catch (_) {
    // diagnostics are best effort
  }
}

async function main() {
  try {
    await reflow()
  } catch (error) {
    await reportError(error)
  }
  await reportDebug()
}

if (core && typeof core.executeAsModal === "function") {
  core.executeAsModal(main, { commandName: "Reflow artboards" })
} else {
  main()
}
