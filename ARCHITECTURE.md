# ECP Registration Architecture (Draft)

## Status

Draft proposal for implementation planning.

## Goal

Make extensibility a first-class capability by introducing a unified registration
mechanism for:

- model providers
- executors
- plugins (for storage, memory, observability, and future capabilities)

The design must support loading extensions from:

- npm packages
- git repositories
- local modules (for development and testing)

## Design Principles

1. Extensible by default
   - Core runtime depends on contracts, not concrete implementations.
2. Deterministic resolution
   - Extension loading is explicit and reproducible.
3. Least privilege
   - Plugins declare capabilities; runtime enforces capability-scoped access.
4. Backward compatible
   - Existing OpenAI/Ollama and protocol wiring continue working during rollout.
5. Spec-aware, runtime-safe
   - Registration metadata can live in Context manifests, but loading remains
     runtime-controlled with validation and policy checks.

## Non-Goals (Initial Phase)

- Remote execution marketplace
- Arbitrary runtime code execution without trust controls
- Hot reloading in production

## High-Level Architecture

The runtime introduces an `ExtensionRegistry` that manages typed registries:

- `ModelProviderRegistry`
- `ExecutorRegistry`
- `PluginRegistry`

Each registry stores descriptors + factories, keyed by stable IDs. The engine
resolves these IDs at startup, builds concrete implementations, and injects them
through existing runtime interfaces.

### Core Components

#### 1) Plugin descriptor

Common metadata for registered plugins:

- `id` (globally unique, kebab-case)
- `kind` — **`provider`**, **`executor`**, **`logger`**, **`memory`**, or future plugin kinds
- `version`
- `apiVersion` (ECP plugin API compatibility)
- `capabilities` (declared features)
- `description` and optional metadata

#### 2) Extension Factories

Factories create runtime instances from validated config:

- model provider factory -> `ModelProvider`
- executor factory -> executor runtime adapter
- plugin factory -> plugin instance with lifecycle hooks
- plugin factory with `kind: "logger"` -> progress callback (`ProgressCallback`); `kind: "memory"` and future kinds return their own instance shapes

Factories must be pure with explicit dependencies:

- logger/tracing
- network/tool access policy handles
- config object (schema-validated)

#### 3) Extension Registry

Responsibilities:

- register descriptors/factories
- detect conflicts (duplicate IDs or incompatible versions)
- expose query API by kind/capability
- lock registry after bootstrap to prevent drift

#### 4) Extension Loader

Resolves extension packages from declared sources:

- `npm`: package name + semver or lockfile pin
- `git`: repo URL + commit SHA/tag
- `local`: file path for local development

Responsibilities:

- fetch/install into isolated extension cache
- verify integrity (hash/signature where available)
- dynamically import declared entrypoint
- call extension module `register(registry, context)`

#### 5) Plugin Runtime Host

Standard lifecycle for plugins:

- `onInit` (startup)
- `onRunStart`
- `onBeforeExecutor`
- `onAfterExecutor`
- `onRunEnd`
- `onShutdown`

This host provides capability-scoped APIs instead of direct internals.

## Extension Types

## Model Providers

Register providers under a provider ID used by `executor.model.provider`.

Example capability declarations:

- `generate-text`
- `structured-output`
- `tool-calling`
- `streaming`

Runtime selection model:

- if executor sets `model.provider`, resolve via `ModelProviderRegistry`
- fallback to default provider only when explicitly configured

## Executors

Register executor implementations by `executor.type` and optional subtype.

Examples:

- `agent`
- `tool`
- `human`
- future custom types (`workflow`, `router`, `critic`)

Executor plugins should not bypass policy enforcement. The runtime wraps all
executor calls with policy and budget checks.

## Plugins

Register cross-cutting features and domain services.

Initial plugin categories:

- storage (future short-term/long-term memory)
- artifacts
- observability exporters
- policy extensions
- credential resolvers

Plugins may also expose named services for other extensions through a controlled
service locator owned by the runtime host.

## Registration Sources and Locking

To support npm and git while preserving reproducibility:

1. Context/runtime declares extension sources.
2. Loader resolves them into a local extension cache.
3. Resolution output is written to a lock artifact (for example
   `ecp.extensions.lock`), containing:
   - source kind (`npm`/`git`/`local`)
   - resolved version / commit SHA
   - integrity hash
   - entrypoint path
4. Subsequent runs can operate in locked mode (no floating upgrades).

## Proposed Context Shape (Conceptual)

This is an architectural target, not final schema:

- `extensions.sources[]`
  - `name`
  - `type`: `npm` | `git` | `local`
  - source-specific fields (`package`, `version`, `repo`, `ref`, `path`)
  - `integrity` (optional but recommended)
- Plugin enable list is **runtime-only** (CLI `--enable` or system config `defaultEnable`). Contexts declare `plugins.providers` but cannot enable plugins themselves; the system/CLI controls which are enabled and can allow-list via system config (`allowEnable`).
- `plugins.config.<pluginId>`
  - schema-validated config passed to factory/hooks

The final schema should remain minimal and default-deny:

- extensions are disabled unless explicitly enabled
- unknown extension IDs fail validation or startup (strict mode)

## Security Model

### Trust Levels

Each source is assigned trust policy:

- `trusted` (internal signed packages)
- `restricted` (allow-listed public packages)
- `blocked` (deny)

### Enforcement

- allow-list package names and git hosts
- require commit SHA pin for git in production mode
- optional signature/integrity verification
- capability gating at runtime host boundary
- sandbox constraints for plugin I/O (where runtime supports isolation)

## Versioning and Compatibility

Define a versioned extension API contract:

- `ECP_EXTENSION_API_VERSION = "v1"`

Each extension declares `apiVersion`; loader rejects incompatible versions.
This allows evolving runtime internals without breaking extension contracts.

## Bootstrap Flow

1. Parse context + runtime config.
2. Build empty registry.
3. Register built-in extensions (OpenAI, Ollama, default executors, etc.).
4. Resolve and load external extension sources.
5. Apply enable-list and config validation.
6. Freeze registry.
7. Construct engine with resolved providers/executors/plugins.
8. Execute run with plugin lifecycle hooks.

## Failure Handling

- Duplicate extension ID -> startup error.
- Missing enabled extension -> startup error.
- Incompatible `apiVersion` -> startup error.
- Plugin init failure:
  - strict mode: fail startup
  - permissive mode: disable plugin and continue with warning

## Incremental Implementation Plan

## Phase 1: Internal Registry Abstractions

- Add typed registry interfaces in runtime.
- Keep current CLI behavior by registering built-ins only.
- Route provider resolution through registry (no external loading yet).

## Phase 2: Source Loader (Local + NPM)

- Implement extension loader with local and npm sources.
- Add lock artifact generation and locked-mode resolution.
- Add validation + trust policy config.

## Phase 3: Git Sources

- Add git resolver with SHA pinning and integrity checks.
- Add caching strategy and retry/backoff behavior.

## Phase 4: Plugin Host + Storage Plugins

- Introduce plugin lifecycle hooks.
- Add first storage plugin contract for short-term/long-term memory.
- Expose storage service to executors through typed runtime API.

## Phase 5: Spec Integration

- Add `plugins` fields to ECP spec types.
- Regenerate JSON schema.
- Add validator checks for extension IDs and config shape references.

## Secret providers (tool credentials)

The runtime resolves `tools.servers.*.credentials.bindings` through a **secret registry** using stable provider ids: **`process.env`**, **`dot.env`**, and **`os.secrets`**. Bindings declare which namespace to read; the CLI can override the on-disk `.env` file for **`dot.env`** with **`--environment`** on execution-oriented commands, while `ecp config secrets` uses persisted config only (no `--environment`). Default secret ref ids are **`ecp://<key>`** (provider is not in the URI). OS-backed entries use that string as the keyring target (**`Entry.withTarget`**) so Windows Credential Manager does not append a second `ecp` from the default `username.service` pattern.

## Testing Strategy for Implementation Phase

When implementation starts, validate with:

- unit tests for registries, conflict detection, version checks
- integration tests for source resolution (npm/git/local)
- engine tests for provider/executor selection via registry
- plugin lifecycle tests with deterministic fixtures
- negative tests for trust policy and lock mismatches

E2E should cover:

- loading provider from npm package
- loading plugin from git SHA
- storage plugin participation in an orchestrated run
