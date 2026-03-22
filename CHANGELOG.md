<!-- markdownlint-disable-file MD024 -->
# Changelog

## Unreleased

### Added

- **CLI:** **`ecp config reset`** removes project **`ecp.config.yaml`** and **`ecp.config.json`**, or with **`--global`** all known config files under **`~/.ecp/`**; **`--config <path>`** deletes a single file. Idempotent when no matching files exist.
- **Runtime / CLI:** **`resolveMergedSystemConfig`** merges project **`ecp.config.*`** with **`~/.ecp/*`** so **global overrides local** on overlapping keys; **`--config <path>`** still loads one file only. **`resolveMergedSystemConfigRequired`** (used by **`ecp run`** / **`ecp validate`**) throws when **no** file is found so execution never proceeds without host policy on disk. **`assertHostPolicyForContext`** centralizes checks for **supported vs allowed models** (`models.providers.*.supportedModels` vs **`security.models.allowedModels`**), **logger allowlists**, **MCP servers** referenced by Context **mounts** vs **`tools.servers`** / **`security.tools.allowServers`**, **`security.models.allowProviders`** (including **`defaultProviders`**), **`security.plugins.allowIds`** (including Context **`plugins.providers`** names), and related gates.
- **`ecp validate`:** **`--config` / `-c`**, **`--model` / `-m`**, **`--provider` / `-p`**, **`--logger` / `-l`** mirror **`ecp run`** for host policy validation before execution.
- **`ecp config add|update`:** **`--default-model`** without **`--supported-models`** seeds **`supportedModels`** with that default; **`ecp config add|update --type models`** also seeds **`security.models.allowedModels.<provider>`** when missing. New **tools** / **loggers** / **endpoints** wiring appends the id to the matching **`security.*` allow** list (and ensures **`security.<area>`** stubs exist).
- **CLI:** `--file -` reads JSON from stdin for commands that accept `--file` (e.g. `ecp config add|update --type …`, `ecp config security plugins update`). On Windows, npm `.cmd` shims and `cmd.exe` often break inline JSON; piping JSON into `--file -` avoids that.
- **CLI:** Typed flags for wiring and policy: **`--option key=value`** (repeatable, unique keys per invocation) for nested `config` blobs; **`--default-model`**, **`--supported-models`** for model **wiring**; **`ecp config security models allowed-models`** edits **`security.models.allowedModels`**; **`--transport-type` stdio|sse**, **`--stdio-command`**, **`--stdio-arg`**, **`--stdio-cwd`**, **`--sse-url`**, **`--credentials-file`** for tools; **`ecp config security plugins update`** accepts **`--allow-kind`**, **`--allow-source-type`**, **`--allow-id`**, **`--deny-id`**, **`--strict`**.

### Fixed

- **Host policy:** `ecp run` / `ecp validate` now **fail** when the Context references a model provider that has **no** `models.providers.<id>` wiring in system config (for example after `ecp config remove --type models`). Security allow-lists alone are not enough; wiring must exist.
- **CLI:** `ecp config add|update` multi-word flags use **kebab-case** on the command line (`--default-model`, `--supported-models`, `--transport-type`, `--stdio-command`, …), matching help text and common POSIX-style conventions.

### Changed

- **`ecp run` / `ecp validate`:** Enforce **effective model** against **`models.providers.<id>.supportedModels`** (implicit **`[defaultModel]`** when **`supportedModels`** is omitted) **and** **`security.models.allowedModels.<id>`** when policy applies; **fail** when a Context **mount** references an MCP server missing from **`tools.servers`** or blocked by **`security.tools.allowServers`** (instead of only logging at runtime).
- **Context `specVersion`:** The latest protocol label is **`ecp/v0.5-draft`** (`LATEST_PROTOCOL_VERSION` in `@executioncontrolprotocol/spec`), aligned with the **0.5.x** npm release line. Update manifests that still use `ecp/v0.3-draft`. Unit tests enforce that system config schema `version`, this string, and workspace `package.json` major.minor stay in sync.

### Breaking changes (CLI)

- **System config models:** **`models.providers.<id>.allowedModels`** is removed. Use **`supportedModels`** for wiring (host capability) and **`security.models.allowedModels`** as a map **`{ <providerId>: [model names] }`** for policy. For each provider in **`security.models.allowProviders`**, **`security.models.allowedModels[providerId]`** MUST be a **non-empty** array, and every entry MUST be supported by that provider’s wiring. **`ecp config add|update --type models`** uses **`--supported-models`** (replaces **`--allowed-models`**). **`ecp config security models allowed-models add|remove`** now edits **`security.models.allowedModels`** only (not wiring).
- **`ecp run`** / **`ecp validate`:** A system config file is **required** when using default discovery (merged project + `~/.ecp`). If no file is found, the command **fails** instead of running without host policy. Use **`ecp config init`**, copy **`config/ecp.config.example.yaml`** to **`ecp.config.yaml`**, add **`~/.ecp/config.yaml`**, or pass **`--config <path>`** to an existing file.
- **`ecp config path`:** **`--forWrite`** is renamed **`--for-write`** (kebab-case, consistent with other flags).
- **`ecp run`**, **`ecp validate`:** positional arg label is **`CONTEXT-PATH`** (was `CONTEXTPATH`). **`ecp trace`** and **`ecp graph`:** positional arg label is **`RUN-ID`** (was `RUNID`). Values are passed the same way; only help/usage naming changed.
- **`ecp config add|update`** and **`ecp config security plugins update`:** removed **`--json`**. Use **`--file`** / **`--file -`**, or the flags above (structured tool transport, model fields, **`--option`**, or security plugin policy flags). **`-c` / `--config`** remains the path to the system config file only.
- **Security subcommand names** (if you already adopted the interim hyphenated paths): `… models allow-providers` → `… models allow`; `… models default-providers` → `… models default`; `… tools allow-servers` → `… tools allow`; `… agents allow-endpoints` → `… agents allow`; `… memory allow-stores` → `… memory allow`; `… memory default-store set` → `… memory default set`; `… secrets allow-providers` → `… secrets allow`.
- **Wiring vs policy:** Removed nested `ecp config models|tools|loggers|endpoints` and `ecp config plugins allow|default`, `ecp config loggers allow|default`, and provider-specific `ecp config models ollama` (and related) commands.
  - **Wiring** (data plane): `ecp config add|remove|get|update --type tools|models|loggers|endpoints` with generic `--provider` + typed flags / `--file` for models; no provider-specific CLI branches.
  - **Policy** (allow/deny/default): `ecp config security …` only — e.g. `ecp config security models allow add <id>`, `ecp config security models default add <id>`, `ecp config security models allowed-models add <provider> <model>`, `ecp config security tools allow add <name>`, `ecp config security loggers allow add <id>`, `ecp config security secrets allow add <id>`, `ecp config security memory allow add <id>`, `ecp config security memory default set <id>`, plus agents/executors subcommands. See `ecp config security` (no args) for the full list.

## 0.5.0

### Breaking changes

- **System config shape (v0.5):** Policy moves to top-level **`security`** (mirrors `models`, `tools`, `loggers`, `secrets`, `plugins`, …). **`plugins.allowEnable` / `defaultEnable` / `security`** under `plugins` are removed — use **`security.models.allowProviders`**, **`security.models.defaultProviders`**, and **`security.plugins`**. **`modelProviders`** → **`models.providers`**; **`toolServers`** → **`tools.servers`**; logger allow/default → **`security.loggers`**; **`agentEndpoints`** → **`agents.endpoints`** as **`{ url, config? }`**. Add **`version: "0.5"`**; other `version` values are rejected when set.
- **Ollama `baseURL`** belongs under **`models.providers.ollama.config.baseURL`** (not a sibling of `defaultModel`).
- **Context manifests:** Top-level **`apiVersion`** is renamed **`specVersion`** (same string values, e.g. `ecp/v0.3-draft`). **`metadata.version`** is **required** when loading a Context (semantic version of that manifest).

### Added

- **`PluginKind` `tool`** in `@executioncontrolprotocol/spec` and **`PLUGIN_KINDS`** tuple; MCP gating via **`security.plugins.allowKinds`** and **`security.tools.allowServers`**.
- **CLI:** `ecp config security get`, `ecp config security plugins update`; **`ecp config secrets yaml`** (`get`, `set-default-provider`, `set-policy`); **`ecp config plugins installs`** (`list`, `add`, `remove`). Legacy `ecp config plugins allow|default|security` commands now read/write **`security.*`** where applicable.

## 0.4.2

### Breaking changes (v0.x)

- **Secret provider ids** in bindings and CLI `--provider` now use explicit namespaces:
  - `env` → `process.env` (live process environment)
  - `dot` → `dot.env` (`.env` file; config key is `secrets.providers.dot.env`)
  - `os` → `os.secrets` (OS credential manager / keychain)
- **No backward compatibility** for the old short ids—update `ecp.config.*`, `toolServers.*.credentials.bindings`, and `ecp config secrets` usage accordingly.
- **`os.secrets` OS storage:** Credentials use an explicit keyring target `ecp://<logical-key>` only (`Entry.withTarget`); the provider id is **not** repeated in the URI (bindings still use `source.provider` + `key`, e.g. shorthand `os.secrets.MY_KEY`). On Windows this avoids Credential Manager showing a duplicated `ecp…ecp` target from the default `username.service` pattern. Default **`SecretRef.id`** values are now `ecp://<key>` for all built-in providers (not `ecp://<provider>/<key>`). **Re-add** OS secrets after upgrading; `ecp://os.secrets/...` targets from an intermediate build are normalized when listing, but re-storing is recommended.

### Added

- **`--environment <path>`** on `ecp run`, `ecp validate`, `ecp trace`, `ecp trace list`, and `ecp graph`: sets the file used by the **`dot.env`** provider for that invocation (overrides `secrets.providers.dot.env.path` in config). Does **not** merge the file into `process.env`. The `ecp config` command tree does not define this flag.

### Fixed

- **Windows `ecp config secrets list`:** `findCredentials` defaulted to a `*.ecp` enumerate filter, which skipped credentials stored with `Entry.withTarget("ecp://…")`. Listing now passes an `ecp://*` filter on Windows so stored secrets appear.

### Documentation

- Expanded [`packages/cli/README.md`](packages/cli/README.md) with secrets behavior, namespaces, and `--environment`.
