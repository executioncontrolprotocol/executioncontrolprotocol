---
"@executioncontrolprotocol/protocol": major
"@executioncontrolprotocol/plugin-sdk": major
"@executioncontrolprotocol/local": major
"@executioncontrolprotocol/engine": minor
"@executioncontrolprotocol/host": minor
"@executioncontrolprotocol/cli": minor
"@executioncontrolprotocol/adobe-firefly-services": major
---

- **@executioncontrolprotocol/protocol** — plugin-manifest schema **2.0** (light index; accepts/returns live in `ecp.schema.json`).
- **@executioncontrolprotocol/plugin-sdk** — `ecp-plugin-manifest` writes both manifest and schema files.
- **@executioncontrolprotocol/local** — a 1.0 manifest fails to load: "Plugin manifest version 2.0 with ecp.schema.json is required. Run ecp-plugin-manifest to regenerate."
- **@executioncontrolprotocol/engine** — validation issues are deduped by code, path, message, and severity; `$secret` / `$env` in an execution emit the dedicated message.
- **@executioncontrolprotocol/host** — editor schema is a small root plus per-plugin files under `$ECP_HOME/schema/plugins/`; the supervisor exits when `ECP_HOME` or `host.json` is deleted.
- **@executioncontrolprotocol/cli** — `ecp plugins` lists the host's plugins (package, version, source, manifest), not oclif's plugin list.
- **@executioncontrolprotocol/adobe-firefly-services** — 63 capabilities across eight families (`content-tagging` still skipped). Two ids renamed so duplicate OpenAPI `operationId`s stay distinct: `audio-video-dub-dub` → `audio-video-dub-translate-lipsync`, `audio-video-transcribe-transcribe` → `audio-video-transcribe-translate-lipsync`.