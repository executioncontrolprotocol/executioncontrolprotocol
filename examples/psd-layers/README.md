# List PSD layers

Reads every layer of a local PSD, including layers inside groups:

1. `azure-blob-storage.upload` uploads the file and signs a read URL (Adobe only reads inputs from
   allowlisted cloud storage).
2. `adobe-firefly-services.photoshop-generate-manifest` returns the document manifest (embedded
   JSON).
3. `azure-blob-storage.delete` removes the uploaded PSD copy from the container (`ifMissing:
   ignore`).
4. A `core.transform` step flattens the layer tree into a list: `name`, `type`, `id`, group `path`, `depth`,
   `visible`, and `text` for text layers, plus document `width`, `height` and `mode`.

## Setup

Configs `azure-blob-storage/default` and `adobe-firefly-services/default`, with their secrets (see
[`../localize-banner/README.md`](../localize-banner/README.md) for both), and the plugins linked:

```sh
ecp plugins link ../../plugins/plugin-azure-blob-storage
ecp plugins link ../../plugins/plugin-adobe-firefly-services
```

## Run

```sh
ecp execute psd-layers.ecp.json --input '{"psdPath": "C:\\path\\to\\banner.psd"}'
```

`psdPath` may be absolute or relative to this execution file (for example
`../localize-banner/fixtures/banner-with-text.psd`). With that fixture:

| Layer | Type | Text |
| --- | --- | --- |
| `Background` | `layer` | |
| `Headline` | `text_layer` | Summer sale |
| `Subhead` | `text_layer` | Limited time offer |

## Notes

- Two `core.transform` steps do the reshaping, each with its own `accepts`/`returns`:
  `scripts/blob-name.js` builds the upload name and `scripts/layer-names.js` flattens the layer
  tree. The result is `psd.document`, `psd.layers`, `psd.names` and `psd.count`.
