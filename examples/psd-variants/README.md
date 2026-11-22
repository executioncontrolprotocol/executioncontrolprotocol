# Banner variants from a CSV

One PSD template, a CSV of variants and a folder of background images in; every variant at every artboard size out.
Each CSV row names a title, a subtitle and a background file (by file name). The workflow checks the rows against
the files, publishes everything once, plans the layout once, then runs the same steps for each row in a
[`forEach`](../../realignment/for-each.md): swap the background and texts in the template, reflow it into the new
artboards, check the result, render one JPEG per new artboard. 3 rows × 4 sizes → 12 renditions.

```csv
title,subtitle,background
Summer Sale,Up to 50% off beachwear,beach.jpg
After Hours,Late-night deals downtown,city.jpg
Into the Woods,New trail gear has landed,forest.jpg
```

1. **`parse`** (`core.parse-csv`) reads the CSV.
2. **`check`** (`scripts/check-variants.js`) matches each row's `background` to one of `backgroundPaths` by file
   name. A missing column, an empty cell, a file name two paths share or a row whose file wasn't given fails here,
   with every problem listed, before anything is uploaded.
3. **`upload`** publishes the template; **`upload-backgrounds`** (`forEach`, 3 at a time) publishes each background
   a row uses, once, however many rows share it.
4. **`source-manifest`** reads the template's layers; **`edits`** (`scripts/variant-edits.js`) turns each row into
   `photoshop-create-composite` layer edits — the background layer's image (`transformMode: "fill"`) and the two text
   layers' content, addressed by layer id and type. Layer names default to `Headline`, `Subhead` and `Background`;
   pass `layers` to use others. A missing or wrong-type layer fails here, before any Photoshop job.
5. **`plan`** — the layout plan from [`../psd-artboards-renditions`](../psd-artboards-renditions), computed once: every
   variant has the template's layout.
6. **`build-variants`** (`forEach` over the rows, `concurrency: 2`, `throttle: { starts: 2, perSeconds: 60 }`,
   `onError: "fail"`), per row:
   - `composite` applies the row's edits to the template and returns a PSD;
   - `reflow`, `inspect`, `structure` build and check the artboards (the
     [`psd-artboards-renditions`](../psd-artboards-renditions) scripts, shared by path);
   - `artboards` selects the new artboards (the plan's sizes, not the Original) and `render` exports one JPEG each;
   - `summary` is the row's result: `{ title, background, ok, problems, renditions: [{ name, file }] }`.

   The `forEach` collects one `summary` per row into `state.variants`, in row order. Each row works on its own copy
   of the state, so rows can't see or overwrite each other's steps.
7. **`cleanup-upload`** and **`cleanup-backgrounds`** remove the published copies; **`flatten`** returns every
   rendition as `renditions.files: [{ row, title, background, name, file }]`.

Every file Photoshop returns is captured into the run (`$ECP_HOME/runs/<runId>/artifacts/`); per-row step records
are `steps/<nodeId>#i<row>.json`.

## Run

Configs `azure-blob-storage/default` and `adobe-firefly-services/default`, and the Azure, Adobe and JSONata plugins
linked or installed.

```sh
ecp execute psd-variants.ecp.json --input '{
  "psdPath": "../localize-banner/fixtures/banner-with-text.psd",
  "csvPath": "variants.csv",
  "backgroundPaths": ["backgrounds/beach.jpg", "backgrounds/city.jpg", "backgrounds/forest.jpg"]
}'
```

`sizes` and `rules` work as in [`../psd-artboards`](../psd-artboards/README.md).

## Rate limits

Two settings, for two different things:

- **The loop's pace** — `concurrency` (how many rows run at once) and `throttle` (how many rows may start per
  window) on the `forEach` node. They bound how much work is in flight.
- **The provider's quota** — each row makes four Photoshop submissions (composite, reflow, manifest, render), so a
  row-level throttle can't guarantee a per-request quota on its own. If your Adobe credentials allow N requests per
  minute, set `"maxRequestsPerMinute": N` in the `adobe-firefly-services/default` config: the plugin then spaces every
  submission evenly, shared by both concurrent rows (and any other run in the host). Status polls aren't counted.

## Limits

Same as `psd-artboards`: top-level text and background layers only, and text colour isn't adjusted for contrast (a
dark subtitle over a dark background stays dark — `city.jpg` shows it). The background is scaled to fill each
artboard from its centre; there's no focal-point cropping.
