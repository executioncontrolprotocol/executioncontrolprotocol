# Reflow a PSD into new artboards and render each one

The deterministic version of [`../psd-artboards`](../psd-artboards): same layout plan, same UXP script, same
structural check, but no model in the workflow. Instead of a vision review it returns one JPEG per artboard, for
whoever reviews the result (a person, or the agent that is tuning the rules). Once the rules are tuned on a sample of
banners, this is the shape you run at scale: every step is a script, a Photoshop job or a JSONata selector, so the
same input always gives the same output, and `structure.ok` is the automatic pass/fail gate.

1. `azure-blob-storage.upload` publishes the PSD; `photoshop-generate-manifest` reads the source layout.
2. **`plan`** (`scripts/plan-layout.js`) — the layout rules: sizes, margins, text scaling and anchoring, per-size
   overrides.
3. **`reflow`** (`photoshop-actions` + `scripts/reflow-artboards.uxp.js`) — builds the artboards; returns the new PSD.
4. `azure-blob-storage.delete` removes the uploaded copy.
5. **`inspect` + `structure`** — reads the new PSD's manifest and checks it against the plan (each artboard at its
   size, holding exactly its layers, text inside the bounds).
6. **`artboards`** (JSONata) — finds the artboards by layer type in that manifest and builds one export per artboard:
   `manifest.layers[type = 'artboard']` → `{ layers: [{ id }], cropMode: "layer_bounds", mediaType: "image/jpeg" }`.
7. **`render`** (`photoshop-create-composite` with no edits) — exports those renditions from the new PSD. Photoshop
   honours per-layer outputs on this job (it ignores them on UXP-script jobs, which is why this is a separate step).
8. **`renditions`** (JSONata) — pairs each rendition with its artboard name: `renditions.artboards: [{ name, file }]`.

Everything Photoshop returns is captured into the run, so the new PSD and every rendition are on disk under
`$ECP_HOME/runs/<runId>/artifacts/` (`reflow-psd-….psd`, `render-jpeg….jpg`).

## Run

Configs `azure-blob-storage/default` and `adobe-firefly-services/default`, and the plugins linked or installed,
including the optional JSONata plugin (`ecp plugins install jsonata`).

```sh
ecp execute psd-artboards-renditions.ecp.json --input '{"psdPath": "../localize-banner/fixtures/banner-with-text.psd"}'
```

`sizes` and `rules` work as in [`../psd-artboards`](../psd-artboards/README.md). To leave the Original artboard out
of the renditions, narrow the selector: `manifest.layers[type = 'artboard' and name != 'Original']`.

## Limits

Same as `psd-artboards`: top-level text and background layers only, and text colour isn't adjusted for contrast.
Renditions come back at each artboard's full size (`maxWidth` isn't applied by this job).
