# List PSD layers

Reads every layer of a local PSD, including layers inside groups:

1. `azure-blob-storage.upload` uploads the file and signs a read URL (Adobe only reads inputs from
   allowlisted cloud storage).
2. `adobe-firefly-services.photoshop-generate-manifest` returns the document manifest (embedded
   JSON).
3. A `$expr` flattens the layer tree into a list: `name`, `type`, `id`, group `path`, `depth`,
   `visible`, and `text` for text layers, plus document `width`, `height` and `mode`.

## Setup

Configs `azure-blob-storage/default` and `adobe-firefly-services/default`, with their secrets (see
[`../localize-banner/README.md`](../localize-banner/README.md) for both), and the plugins linked:

```sh
ecp plugins link ../../plugins/plugin-azure-blob-storage
ecp plugins link ../../plugins/plugin-adobe-firefly-services
ecp plugins link ../../plugins/plugin-test
```

## Run

```sh
ecp execute psd-layers.ecp.json --input '{"psdPath": "C:\\path\\to\\banner.psd"}'
```

`psdPath` must be absolute. With [`../localize-banner/fixtures/banner-with-text.psd`](../localize-banner/fixtures/banner-with-text.psd):

| Layer | Type | Text |
| --- | --- | --- |
| `Background` | `layer` | |
| `Headline` | `text_layer` | Summer sale |
| `Subhead` | `text_layer` | Limited time offer |

## Notes

- The flattening step uses `test.echo` to carry the computed value into state, so the result is
  wrapped as `psd.echo`. ECP has no built-in transform step yet.
- Each run uploads a copy of the PSD under `psd-layers/` in the configured container; the Azure plugin
  has no delete capability, so clean up there.
