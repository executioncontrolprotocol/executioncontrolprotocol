# Later

Work that's decided in direction but not scheduled in this milestone. Each item names what it
builds on and what has to be true first. When one is picked up, it gets its own phase doc.

| Item | What it is | Builds on | Before starting |
| --- | --- | --- | --- |
| 1.0 release | Exit 0.50 field-test: `npm deprecate` renamed/removed 0.14 packages with pointers; archive `extensions` and `browser-demo`; turn off monorepo GitHub Pages; live Dogfood A/B/C (Claude Code 3×3, Desktop MCP, App graph); bump to `1.0.0`; annotated tag `ecp-1.0.0` (do not reuse `v1.0.0`); set `RESET-PLAN.md` to Shipped | Phase 9 0.50.0 on npm `latest` | Field-test feedback; operator dogfood sessions |
| Healing automation | `ecp run --on-failure "<command>"` wakes an agent (for example `claude -p`) with the journal path when an unattended run fails, plus `ecp schedule` for recurring runs | Journal and error codes (Phase 4) | Decide where schedules live (OS scheduler vs a small daemon) |
| In-page App | A browser `HostAdapter` running on the browser environment, for a docs playground, hosted demo or Strata embedding | `app`'s `HostAdapter` (Phase 8) | A browser custody provider. `browser-secrets` was removed; design a replacement |
| `plugin-reflex` | System-1 typed decisions (`decide.choice`, `decide.yesno`, `decide.score`) as capabilities, backed by so1 readout, Laya or Jev | Plugin SDK; journal for drift signals | Results from the Reflex test harness plan (agent-os `reflex/`) |
| Hosted MCP | The MCP package served remotely, with a cloud secrets provider | Phase 7 | Strata hosting decisions; "never diverge" rule (§8.2) |
| Temporal environment | `@executioncontrolprotocol/temporal` built with `defineEnvironment`, for durable runs | Phase 2 environments | A real hosted-execution need |
| Design Intelligence | A domain plugin for portable `CreativeDocument`s (`design.*` capabilities), using Firefly, Sharp and FAL | Plugins (Phase 5) | Revisit the agent-os `ecp-design-intelligence` notes |
| n8n adapter | A plugin wrapping n8n nodes as capabilities for connector breadth | Plugin SDK | License, dependency and credential-handling review |
| Real Slack plugin | `chat.postMessage` and friends, replacing the removed mock | Plugin SDK | A real use case |
| Memory plugin | Persistent recall across runs, replacing the removed stub | Plugin SDK | Decide the backing store |
| Telemetry plugin | OpenTelemetry export on oclif lifecycle hooks (Adobe's pattern) | CLI hooks (Phase 3), events (Phase 4) | A user who needs it |
| Chrome AI | A browser-only model provider plugin | In-page App | In-page App shipped |
| Per-workflow plugin isolation | Project-local plugin installs so two workflows can pin different majors | Inference (Phase 4) | Evidence that version conflicts happen in practice |
