# Execution Control Protocol (ECP)

[![CI](https://github.com/executioncontrolprotocol/executioncontrolprotocol/actions/workflows/ci.yml/badge.svg)](https://github.com/executioncontrolprotocol/executioncontrolprotocol/actions/workflows/ci.yml)

ECP (Execution Control Protocol) is the **deterministic delegation** layer an
orchestrating agent operates: author a workflow file, run it, read structured
errors and a journal, then repair and rerun. It is part of a harness, never the
whole harness.

MCP standardizes how models call tools. ECP standardizes how an agent
**delegates** a graph of those tools — under plugins and policies, with a
journal you can inspect.

**Docs:** [https://executioncontrolprotocol.io/](https://executioncontrolprotocol.io/)

## Use the CLI

```bash
npm install -g @executioncontrolprotocol/cli
npx skills add executioncontrolprotocol/docs
ecp workflows init brief
ecp plugins install jsonata
ecp run brief.ecp.ts
```

The field-test is **0.51.0** on `latest` (not 1.0). `ecp workflows init` scaffolds
a `jsonata.transform` step, so install that plugin before you run.

## Work in this repo

**Prerequisites:** Node.js 22+, pnpm 10 (`corepack enable`). Install from the
**repo root** only.

```bash
git clone https://github.com/executioncontrolprotocol/executioncontrolprotocol.git
cd executioncontrolprotocol
corepack enable
pnpm install
pnpm run build
```

Link the CLI, then run the echo example. `test.echo` is not a Node default:

```bash
cd packages/cli
pnpm link --global
cd ../..
ecp plugins link plugins/plugin-test
ecp run examples/01-echo/workflow.ecp.ts
```

**Contributor skill:**
`npx skills add executioncontrolprotocol/executioncontrolprotocol --skill ecp-core -y`

## What you operate

| Piece | Role |
| ----- | ---- |
| **Workflow** | One `*.ecp.ts` file. Bindings go in `.with([...])`. Compiles to a portable JSON graph. |
| **Environment** | Host (Node by default) plus installed plugins and policies. |
| **Plugin** | npm package that registers capabilities and generates CLI commands. |
| **Journal** | One directory per run under `.ecp/runs/<runId>/`. |

```bash
ecp workflows validate examples/01-echo/workflow.ecp.ts --json
ecp run examples/01-echo/workflow.ecp.ts --json
ecp runs show <id>
ecp plugins link plugins/plugin-jsonata
```

`--json` prints `{ ok: true, data }` or
`{ ok: false, error: { code, message, path, suggestions } }`.

## Repository map

| Path | What it is |
| ---- | ---------- |
| [`packages/core/`](packages/core/) | Fluent API, engine, protocol types (`@executioncontrolprotocol/core`, `./types`) |
| [`packages/environments/node/`](packages/environments/node/) | Node host: compile, secrets, journals |
| [`packages/environments/browser/`](packages/environments/browser/) | Browser host |
| [`packages/cli/`](packages/cli/) | `ecp` CLI |
| [`packages/plugin-sdk/`](packages/plugin-sdk/) | `toCommands`, `defineOperation` |
| [`packages/mcp/`](packages/mcp/) | `ecp mcp serve` |
| [`packages/app/`](packages/app/) | Visual App library (`ecp app` is `plugins/plugin-app`) |
| [`plugins/`](plugins/) | First-party plugins |
| [`examples/`](examples/) | Single-file `*.ecp.ts` workflows |

Dependencies are TypeScript, Zod, oclif, and workspace packages (`workspace:^`).

**Monorepo guide:** [`AGENTS.md`](AGENTS.md)
**Reset plan (contributor):** [`RESET-PLAN.md`](RESET-PLAN.md)

## Checks

```bash
pnpm run check
```

That runs build, schema generation, lint, secrets scan, coverage, integration,
and e2e. Browser tests: `pnpm run test:browser:install` then `pnpm run test:browser`.

## What ECP is not

ECP is not an agent framework, a chat client, or a replacement for MCP. The
agent owns judgement: what to build, what a failure means, how to fix it. ECP
owns step order, data flow, policies, secrets custody, and the journal.
