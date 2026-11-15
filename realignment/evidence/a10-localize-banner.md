# A10 — localize-banner live evidence

**Status:** skipped in this environment (2026-11-15).

Firefly client credentials and signed localize source/output URLs were not available.
A local `ANTHROPIC_API_KEY` was present but returned HTTP 401 against Messages, so it
was not used as partial evidence.

Required env (all must be set for the live suite to run):

- `ECP_LIVE_A10=1` (explicit opt-in; absent keys alone do not run live calls)
- `ECP_SECRET_ADOBE_FIREFLY_CLIENT_ID`
- `ECP_SECRET_ADOBE_FIREFLY_CLIENT_SECRET`
- `ECP_SECRET_ADOBE_FIREFLY_SCOPES` (optional)
- `ECP_SECRET_ANTHROPIC_API_KEY` or `ANTHROPIC_API_KEY`
- `ECP_LIVE_LOCALIZE_SOURCE_URL` (signed/readable PSD or image URL for Photoshop Actions)
- `ECP_LIVE_LOCALIZE_OUTPUT_URL` (writable external output href)

Automated gate: `packages/host/test/integration/localize-banner.live.test.ts`
(`describe.skipIf(!ready)`). When secrets are present it writes
`realignment/evidence/a10-localize-banner.json` with `runId`, `status`, `result`, and
`steps` for the PR.

Capability-only Firefly smoke (no Anthropic / banner inputs):
`plugins/plugin-adobe-firefly-services/test/live/firefly.live.test.ts`.
