# Localize banner (A10)

Dogfood execution for Adobe Firefly Services + Anthropic (no `test.echo` steps):

1. Optionally translate every string with `anthropic.generate` when `locale` is not `en`
   (model returns JSON `{ texts, headline }`).
2. Run `adobe-firefly-services.photoshop-actions` with
   `scripts/relabel-text-layers.uxp.js` (`$script.path`). `$expr` on the script params
   parses the model JSON (or falls back to input `texts` / `headline`) and the UXP walks
   the document (including groups) rewriting **every** text layer by name.
3. Return `translation` and `banner`.

## Source PSD

| Asset | Usable? | Notes |
| --- | --- | --- |
| [filesamples 640×426 PSD](https://filesamples.com/samples/image/psd/sample_640%C3%97426.psd) | No | Single raster layer `L1` only — **no text layers** (`TySh` absent). Also not on Adobe’s input URL allowlist (needs S3/Azure/GCS/Dropbox/… HTTPS). |
| `fixtures/banner-with-text.psd` | Yes | 640×426 with text layers `Headline` = `Summer sale` and `Subhead` = `Limited time offer`. The live A10 test uploads it to Azure (`ecp-test` / `localize-banner/…`) and mints SAS URLs. |

## Configs

Create these before the first run (values via secrets):

```json
{
  "schema": "@executioncontrolprotocol.config",
  "version": "1.0",
  "id": "anthropic/default",
  "plugin": "@executioncontrolprotocol/anthropic",
  "values": {
    "apiKey": { "$secret": "anthropic/api-key" },
    "model": "claude-sonnet-4-5"
  }
}
```

```json
{
  "schema": "@executioncontrolprotocol.config",
  "version": "1.0",
  "id": "adobe-firefly-services/default",
  "plugin": "@executioncontrolprotocol/adobe-firefly-services",
  "values": {
    "clientId": { "$secret": "adobe-firefly-services/client-id" },
    "clientSecret": { "$secret": "adobe-firefly-services/client-secret" }
  }
}
```

```sh
ecp config secrets set anthropic/api-key
ecp config secrets set adobe-firefly-services/client-id
ecp config secrets set adobe-firefly-services/client-secret
ecp plugins link ../../plugins/plugin-anthropic
ecp plugins link ../../plugins/plugin-adobe-firefly-services
ecp plugins link ../../plugins/plugin-azure-blob-storage
ecp execute localize-banner.ecp.json --input '{
  "locale": "fr",
  "texts": { "Headline": "Summer sale", "Subhead": "Limited time offer" },
  "sourceImageUrl": "https://…/banner-with-text.psd",
  "outputUrl": "https://…/out.png"
}'
```

Live acceptance (A10) needs `ECP_LIVE_A10=1`, Firefly + Anthropic secrets, and signed
allowlisted `sourceImageUrl` / `outputUrl` (`packages/host/test/integration/localize-banner.live.test.ts`).
Capability-only Firefly smoke uses `ECP_LIVE_FIREFLY=1` under
`plugins/plugin-adobe-firefly-services/test/live/`.
