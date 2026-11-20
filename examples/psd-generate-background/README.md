# Generate a PSD background and set its text

Turns a template PSD into a new banner from a prompt and two strings:

1. In parallel: `azure-blob-storage.upload` uploads the template and signs a read URL, and
   `adobe-firefly-services.firefly-generate-images-v3-async` generates the background (2304×1792,
   `contentClass: photo`).
2. `adobe-firefly-services.photoshop-create-composite` replaces the background layer's pixels with the
   generated image (`transformMode: fill`, cropped to the canvas) and sets the headline and subhead
   text layers. Omitted text inputs keep the template's text.
3. `azure-blob-storage.delete` removes the uploaded template copy from the container (`ifMissing:
   ignore`).
4. Adobe hosts the results for a day: a PNG and a layered PSD.

## Setup

Configs `azure-blob-storage/default` and `adobe-firefly-services/default` with their secrets (see
[`../localize-banner/README.md`](../localize-banner/README.md)), and the plugins linked:

```sh
ecp plugins link ../../plugins/plugin-azure-blob-storage
ecp plugins link ../../plugins/plugin-adobe-firefly-services
```

## Run

```sh
ecp execute psd-generate-background.ecp.json --input '{
  "psdPath": "C:\\path\\to\\banner-with-text.psd",
  "prompt": "A sunlit alpine lake at golden hour with snow-capped peaks, wide landscape, soft natural light",
  "headline": "Winter getaway",
  "subhead": "Book by December 15"
}'
```

| Input | Required | Default |
| --- | --- | --- |
| `psdPath` | yes | Path to the template PSD (absolute, or relative to this execution file) |
| `prompt` | yes | |
| `headline`, `subhead` | no | Keep the template's text |
| `backgroundLayer` | no | `Background` |
| `headlineLayer`, `subheadLayer` | no | `Headline`, `Subhead` |

The result has `background.outputs[0].image.url` (the generated image, valid for an hour) and
`banner.outputs[]` with the hosted PNG and PSD URLs (`destination.url`, valid for a day). Verified with
[`../localize-banner/fixtures/banner-with-text.psd`](../localize-banner/fixtures/banner-with-text.psd);
running [`../psd-layers`](../psd-layers/README.md) on the output PSD shows the edited text layers.

## Notes

- The text keeps the template's styling (font, size, colour). On a busy photo that can be hard to
  read; the composite API accepts character styles if you want to set colour or size too.
