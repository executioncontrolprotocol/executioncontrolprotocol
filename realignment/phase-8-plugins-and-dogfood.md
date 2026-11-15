# Phase 8 — First-party plugins and dogfood

**Goal:** the real plugins on the new SDK, the v1 examples and dogfood tasks running on the new
engine, and the Firefly `localize-banner` execution working live.

**Depends on:** Phase 2 (SDK), Phase 3 (host) for end-to-end runs. Can start right after
Phase 2 in parallel with Phases 4–7. **Spec:** 08, 12 (A10).

## Tasks

1. **`plugin-anthropic`:** port `generate` from `legacy/plugins/plugin-anthropic`; config `{ apiKey, model, baseUrl? }`; honour `signal`; map API errors to thrown errors with `code`/`details`; usage recorded.
2. **`plugin-azure-blob-storage`:** port `upload`, `download`, `sas` with file refs (`ctx.files`); config `{ connectionString }` or `{ accountName, accountKey }`.
3. **`plugin-adobe-firefly-services`:** port the OpenAPI generator (`legacy/plugins/plugin-adobe-firefly-services/scripts/`) to emit `definePlugin` capabilities with lazy per-capability handler modules; keep the HTTP input/output rules (`extensions.mdc`); IMS token fetch with in-memory caching per config (refresh before expiry) so a warm host reuses it; internal polling honouring `signal`; `photoshop-actions` `options.uxp.source.content` as a string with the API's `maxLength`. Regenerate from the checked-in OpenAPI specs; commit generated code.
4. **Examples:** `examples/` gets the v2 conversions from `fixtures/v1/` that are useful to users (echo, weekly brief, branch-loop, dogfood reshape/photo/caption without policies), each with a README and `$schema` line.
5. **Dogfood `localize-banner`:** `examples/localize-banner/` with `localize-banner.ecp.json`, `scripts/relabel-headline.uxp.js` (`$script.path`), configs to create, and a README; live test under `plugins/plugin-adobe-firefly-services/test/live/` gated on Firefly + Anthropic secrets.
6. **Run every v1 conversion** in `fixtures/v1/` on the new engine with `plugin-test` or the real plugins (mocked HTTP where live credentials are absent) and compare state outcomes to the expected run fixtures.

## Tests

- Each plugin: unit tests with HTTP mocked at the fetch layer (no live calls): happy path, API error mapping, abort via `signal`, file refs, config validation; manifest `--check` in CI.
- Firefly generator: snapshot of generated output for two specs; every generated capability has `useCases` and `projections`; `accepts` hoisting and `body` merge rules.
- Live (when secrets exist): Anthropic generate; Azure upload/download/sas (Azurite if present); Firefly `localize-banner` (A10).

## Exit criteria

- [x] Four plugins built with checked manifests and passing tests.
- [x] All v1 conversions run on the new engine with expected outcomes.
- [ ] A10 run live once; its output (run record summary, produced PSD link or artifact) attached to the PR.
  - Suite ready: `packages/host/test/integration/localize-banner.live.test.ts` (skips without Firefly + Anthropic + signed URLs).
  - Skip evidence: `realignment/evidence/a10-localize-banner.md`. Re-run with secrets to write `a10-localize-banner.json` for the PR.
