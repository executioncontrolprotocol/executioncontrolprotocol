# Localize banner (A10)

Dogfood execution for Adobe Firefly Services + Anthropic:

1. Echo the headline and locale into state.
2. Optionally translate with `anthropic.generate` when `locale` is not `en`.
3. Run `adobe-firefly-services.photoshop-actions` with a UXP script from
   `scripts/relabel-headline.uxp.js` (`$script.path`).
4. Return the localized headline.

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
ecp secrets set anthropic/api-key
ecp secrets set adobe-firefly-services/client-id
ecp secrets set adobe-firefly-services/client-secret
ecp plugins link ../../plugins/plugin-test
ecp plugins link ../../plugins/plugin-anthropic
ecp plugins link ../../plugins/plugin-adobe-firefly-services
ecp execute --path localize-banner.ecp.json --wait --input '{
  "locale": "fr",
  "headline": "Summer sale",
  "sourceImageUrl": "https://…/banner.psd",
  "outputUrl": "https://…/out.png"
}'
```

Live acceptance (A10) needs `ECP_LIVE_A10=1` plus Firefly + Anthropic secrets and signed
source/output URLs (`packages/host/test/integration/localize-banner.live.test.ts`).
Capability-only Firefly smoke uses `ECP_LIVE_FIREFLY=1` under
`plugins/plugin-adobe-firefly-services/test/live/`.
