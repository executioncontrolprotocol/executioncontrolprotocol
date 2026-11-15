# A10 — localize-banner live evidence

**Status:** green 2026-11-15 — full PSD localize-banner against Anthropic + Firefly Photoshop Actions + Azure Blob.

## What ran

| Step | Result |
| --- | --- |
| Azure upload of `fixtures/banner-with-text.psd` | Blob `localize-banner/banner-with-text.psd` in container `ecp-test` |
| Anthropic translate (`locale: es`) | JSON `{ texts }` (parsed in `$script` params via `$expr`; no `test.echo`) |
| Photoshop Actions + UXP `relabel-text-layers.uxp.js` | **completed**; wrote `localize-banner/banner-out.png` |

Run summary: `a10-localize-banner.json` (SAS query strings redacted). Capability smoke still in `a10-smoke-runs.json`.

## How to re-run

1. Secrets: Anthropic, Adobe Firefly, Azure connection string (see `examples/localize-banner/configs/`).
2. Host up; plugins linked (test, anthropic, adobe-firefly-services, azure-blob-storage).
3. `ECP_LIVE_A10=1 pnpm exec vitest run packages/host/test/integration/localize-banner.live.test.ts` — the test uploads the fixture PSD, mints read/`cw` SAS URLs, and runs the example.

Output destinations must set `storageType: "azure"` (Adobe PUT otherwise returns `upload_error` 400).
