# Reflow a PSD into new artboards (agent loop)

Takes a banner PSD (background image, headline, subhead) and builds a new PSD with the original plus new artboard
sizes, the layers copied in and reflowed: the background scaled to cover each artboard, and the text block scaled
and anchored inside its margins. The run then checks its own result twice, and returns everything an agent needs
to decide whether to adjust and rerun.

1. `azure-blob-storage.upload` publishes the PSD so Photoshop can read it.
2. `photoshop-generate-manifest` reads the source layout.
3. **`plan`** (`scripts/plan-layout.js`, a `core.transform`) — the design decisions: sizes, margins, how text
   scales, where the text block anchors, which layer is the background. Edit this (or pass `rules`) to change the
   layout.
4. **`reflow`** (`photoshop-actions` with `scripts/reflow-artboards.uxp.js`) — carries the plan out in Photoshop:
   measures the real layers, creates the artboards, copies and places layers. Returns the new PSD and a 2400 px
   preview of the whole canvas.
5. `azure-blob-storage.delete` removes the uploaded copy.
6. **`inspect` + `structure`** — reads the new PSD's manifest and checks it against the plan: every artboard at its
   size, holding exactly its layers, text inside the bounds, no `ECP_ERROR` layer.
7. **`review`** (`anthropic.generate` with the preview as an image) — Claude judges the artboards visually and
   returns `{ pass, score, artboards: [{ name, ok, issues }], fixes }`.

Every output file is captured into the run, so the new PSD is on disk at
`$ECP_HOME/runs/<runId>/artifacts/reflow-psd-….psd` (with the preview next to it).

## The loop

The workflow is one pass. The agent driving it closes the loop: run, read `structure` and `verdict`, look at the
preview, then change the plan (`rules`, per-size `rules`, or `plan-layout.js`) or the UXP script, and run again.
The vision review is a signal, not a gate: at canvas resolution it is sometimes wrong (it can flag a problem on an
artboard that didn't change), and it doesn't know the image (it may suggest moving text onto busy detail). The
structure check is exact; the agent weighs both.

## Run

Configs `azure-blob-storage/default`, `adobe-firefly-services/default` and `anthropic/default`, with the plugins
linked or installed.

```sh
ecp execute psd-artboards.ecp.json --input '{"psdPath": "../localize-banner/fixtures/banner-with-text.psd"}'
```

Custom sizes, with per-size overrides:

```json
{
  "psdPath": "C:\\banners\\spring.psd",
  "sizes": [
    { "name": "Square 1080", "width": 1080, "height": 1080, "rules": { "textScale": 1.15 } },
    { "name": "Story 1080x1920", "width": 1080, "height": 1920, "rules": { "anchorY": 0.12, "textScale": 1.35 } },
    { "name": "Leaderboard 728x90", "width": 728, "height": 90, "rules": { "anchorY": "center" } }
  ],
  "rules": { "margin": 0.08, "debug": true }
}
```

Rules: `margin` (share of the shorter side), `gap` (px between artboards), `textScale` (multiplier on the natural
scale), `maxTextWidth`, `anchorX` (`source` | `left` | `center`), `anchorY` (`source` | `top` | `center` |
`bottom` | 0–1), `debug` (leave the script's measurements as hidden `ECP_DEBUG` layers, shown in
`structure.notes`).

## Limits

- The source's text layers and background must be top-level layers; groups aren't reflowed yet.
- One preview of the whole canvas: per-artboard renditions would make the visual review much sharper, but Photoshop
  ignores an output's `layers` on UXP-script jobs, and script-written outputs need an output folder the API doesn't
  document.
- Text colour isn't adjusted for contrast; a dark subhead over a dark part of the image stays dark.
