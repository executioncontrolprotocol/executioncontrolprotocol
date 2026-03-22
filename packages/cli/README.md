# `@executioncontrolprotocol/cli`

**Execution Control Protocol (ECP)** specifies portable **Context** manifests for agent orchestration: structured inputs and outputs, tool boundaries, per-executor policies, and host-level enforcement via system config—so runs stay least-privilege and auditable.

**Learn more:** [executioncontrolprotocol.io](https://executioncontrolprotocol.io)

This package is the **command-line interface** for validating and running Contexts.

## Install

```bash
npm install -g @executioncontrolprotocol/cli
```

## Usage

```bash
ecp --help
ecp validate path/to/context.yaml
ecp run path/to/context.yaml -i topic="Hello"
```

### System config (`ecp.config.yaml` / `~/.ecp/config.yaml`)

**v0.5 layout:** use top-level **`security`** for allow-lists and defaults (mirrors `models`, `tools`, `loggers`, …). Wiring lives under **`models.providers`**, **`tools.servers`**, **`loggers.config`**, **`agents.endpoints`**, **`plugins.installs`**, **`secrets`**. Set **`version: "0.5"`**.

```bash
ecp config --help
ecp config init                    # best-practices starter in current directory
ecp config init --global          # ~/.ecp/config.yaml
ecp config path                    # resolved file path (use --for-write for mutation target)
ecp config get --format json
ecp config security get
ecp config plugins get             # plugins.installs + security.plugins summary
ecp config models get
ecp config tools get
ecp config loggers get
ecp config secrets yaml get
```

`ecp run` accepts `--logger` / `-l` (e.g. `file`) to enable logger **plugins** (`kind: logger`); defaults and allow-lists are under **`security.loggers`**, per-logger options under **`loggers.config`**.

YAML and JSON are supported; defaults are searched in order: `./ecp.config.yaml`, `./ecp.config.json`, then `~/.ecp/`.

## Secrets and environment files

ECP separates **where** a secret is loaded from using **provider ids** in `tools.servers.<name>.credentials.bindings[].source`:

| Provider id   | Meaning                                                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `process.env` | Read from the current process environment (`process.env[<key>]`).                                                                                                                                            |
| `dot.env`     | Read from a `.env`-style file on disk (path from config or `--environment`).                                                                                                                                 |
| `os.secrets`  | Read from the OS credential manager / keychain; stored under an `ecp://<key>` target (same as default `SecretRef.id`; provider is only in `source.provider`, e.g. `os.secrets.MY_KEY` as shorthand in docs). |

Bindings use **plain keys** (e.g. `GITHUB_PAT`, `server/fetch.token`) in `source.key`. Values are never stored in Context YAML—only references.

### `ecp config secrets`

Use **`os.secrets`** for durable storage (e.g. `ecp config secrets add --provider os.secrets --key myapp/token --prompt`). The `ecp config` commands do **not** support `--environment`; they resolve `dot.env` only from `ecp.config.*` (`secrets.providers.dot.env.path`).

### `--environment` (runtime commands only)

On **`ecp run`**, **`ecp validate`**, **`ecp trace`**, **`ecp trace list`**, and **`ecp graph`**, you can pass:

```bash
ecp run context.yaml --environment ./.env.local
```

This sets the **file** used by the **`dot.env`** provider for that process. It **does not** merge variables into `process.env`; use `source.provider: process.env` only for variables already in the shell/CI environment, and `source.provider: dot.env` for file-backed values.

If both `--environment` and `secrets.providers.dot.env.path` are set, **`--environment` wins** for that command. If the path does not exist, the CLI exits with an error.

## Links

- **Docs**: [executioncontrolprotocol.io](https://executioncontrolprotocol.io)
- **Repo**: `https://github.com/executioncontrolprotocol/executioncontrolprotocol`
- **Issues**: `https://github.com/executioncontrolprotocol/executioncontrolprotocol/issues`
