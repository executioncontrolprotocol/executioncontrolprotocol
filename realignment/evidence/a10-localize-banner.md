# A10 — localize-banner live evidence

**Status:** option-3 smoke green 2026-11-15 (Anthropic generate + Firefly generate-images). Full localize-banner PSD path still blocked on signed source/output URLs.

## What ran

| Probe | Result |
| --- | --- |
| Anthropic `generate` via `ecp execute` | **completed** — `text: "ready"` (`run-20261115T190335Z-38d8e4`) |
| Firefly `firefly-generate-images-v3-async` via `ecp execute` | **completed** — 2048×2048 image (`run-20261115T190345Z-1eaf25`) |

Configs `anthropic/default` and `adobe-firefly-services/default` are committed; secrets resolve from the OS keychain. Plugins linked: test, anthropic, azure-blob-storage, adobe-firefly-services.

Raw run summaries: `a10-smoke-runs.json`.

## Full A10 (localize-banner PSD) still needs

- `ECP_LIVE_A10=1` plus readable `sourceImageUrl` and writable `outputUrl` (Azure SAS typically), or an Azure connection string to generate them in-run.
- Then: `ecp execute examples/localize-banner/localize-banner.ecp.json` with locale/headline/source/output input, or the host live test.

## Fixes landed while probing

- `$secret` / `$env` config masking placeholder is `"*"` (empty string failed Firefly `minLength`).
- Provider failures keep upstream text on the run (`error.message` + `error.details.body`). Rule: `.cursor/rules/extensions.mdc`.
