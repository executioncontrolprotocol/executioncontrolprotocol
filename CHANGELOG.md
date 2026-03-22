<!-- markdownlint-disable-file MD024 -->
# Changelog

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
