# ECP Browser Demo

**ECP Graph Editor** demo app (Vite + React): chat-first UX, workflow/code panels, Mermaid graph viewer, and first-run provider selection.

This app lives at `apps/browser-demo` in the ECP monorepo. It is private and is not published to npm.

## Try it now

Open the hosted Graph Editor in **Chrome** (recommended):

**https://demo.executioncontrolprotocol.io/**

Complete the first-run provider modal, then chat or explore the panels. No clone required.

## Prerequisites

| Requirement | When you need it |
| ----------- | ---------------- |
| **Node.js >= 22** | Local app — enforced in `package.json` `engines` |
| **pnpm** | Local app — enable with `corepack enable` (version pinned in the repo `packageManager`) |
| **Chrome** (recommended) | Default chat path uses Chrome built-in AI (`@executioncontrolprotocol/chrome-ai`) |
| **Ollama** + **ECP CLI** (`ecp up`) | Optional — local models via loopback daemon on port 3090 |
| **`.env` (Supabase)** | Optional — prompt logging only; not required to run the app |

## Local quick start

From the **monorepo root**. You do **not** need `.env` or `ecp up` for the default Chrome AI path.

```sh
pnpm install
pnpm run build
pnpm run dev:demo
```

Open the URL Vite prints (default `http://localhost:5173`). Complete the first-run modal (Chrome AI, or **Explore** without a model), then send a chat or use the panels.

```sh
pnpm run build
pnpm test
pnpm run lint
```

(`pnpm run lint` runs `typecheck`; Husky pre-commit runs secretlint, then lint.)

## Local startup options

| Goal | Terminal 1 | Terminal 2 | Notes |
| ---- | ---------- | ---------- | ----- |
| Chrome AI / Explore only | `pnpm run build` then `pnpm run dev:demo` | — | No daemon; default first-run path |
| Ollama + coding harness | same | `pnpm run up:demo -- --ollama-only` | Daemon on **3090**; opens demo with `?token=` |
| Ollama + host hops (Sharp, fal, OpenAI, …) | same | `pnpm run up:demo` | Uses [`host/environment.ts`](./host/environment.ts); see [`host/README.md`](./host/README.md) |
| Hosted demo + local models | — | `ecp up` (global CLI) | Opens https://demo.executioncontrolprotocol.io/ with pairing |

### `ecp up` details (local Vite)

1. Install and start [Ollama](https://ollama.com/); pull a model (for example `qwen2.5-coder:1.5b`).
2. From the monorepo root (after `pnpm run build`):

```sh
# Terminal 1
pnpm run dev:demo

# Terminal 2 — recommended for this app (host env + Ollama)
pnpm run up:demo

# Or Ollama + storage only (no Sharp/fal host bindings)
pnpm run up:demo -- --ollama-only
```

`pnpm run up:demo` runs the workspace CLI with an absolute `--env` path so it works from the repo root (relative `--env` under `pnpm --filter @executioncontrolprotocol/cli exec` resolves inside `packages/cli/` and fails).

Equivalent with a global CLI from `apps/browser-demo`:

```sh
ecp up --env ./host/environment.ts --open-url http://localhost:5173/
```

Useful flags: `--no-open` (print token only), `--port 3090`, `--cors-origin http://localhost:5173` (also inferred from `--open-url`).

Ollama enables in the UI when the daemon `GET /health` reports `ollamaReachable`. Paste `?token=` / `?bridge=` from the daemon log if the browser did not open automatically. Hosted HTTPS demos need **Chromium** (Private Network Access); local Vite works in any browser.

The browser demo catalog (`default` vs `extended`) is chosen at `ecp up` start via `?env=` on the open URL (inferred from the `--env` path). It is not a runtime setting.

Bare `ecp up` (no `--env`) is enough for Ollama chat, but **not** for Sharp or other host-only steps — use `pnpm run up:demo` (or `--env` pointing at [`host/`](./host)).

Harness evals (Ollama `gemma3:1b` / `qwen2.5-coder:1.5b`) run from the monorepo root: `pnpm run test:eval:matrix` / `pnpm run test:eval:matrix:coding`.

## Architecture (app owns composition)

| Layer | Package | Role here |
| ----- | ------- | --------- |
| Compile | `@executioncontrolprotocol/core/browser` | Fluent/TS compile in the page |
| Runtime host | `@executioncontrolprotocol/browser` | Executor, registry, session — **no harnesses** |
| This app | `createDemoAppEnvironment` | Binds formats, Chrome AI / Ollama / …, **nano + coding harnesses** |

Provider and harness are independent switches (`resolveDemoSession`). Choosing **Ollama** or **Claude (Anthropic)** selects the **Fluent/TS coding** harness; Chrome AI uses the nano (EQL) harness.

### Browser vendor extensions

Prefer the real SDK whenever it can run in the browser:

| Extension | Browser runtime | Notes |
| --------- | --------------- | ----- |
| `@executioncontrolprotocol/fal` | **Yes** — official `@fal-ai/client` | Configure `apiKey` via `browser("FAL_KEY")` (vault / secrets). Vite prebundles the CJS client (`optimizeDeps.include`). |
| `@executioncontrolprotocol/image-sharp` | **Catalog + host hop** | Bound in the demo env (browser catalog only; no native `sharp`). Steps hop to a paired host — use `pnpm run up:demo` ([`host/`](./host)). Bare / `--ollama-only` is not enough for Sharp. |

Vendor packages are workspace dependencies of this app (`packages/vendor`). The paired host example lives at [`host/`](./host). Sharp-only smoke: [`examples/vendor/04-image-prep`](../../examples/vendor/04-image-prep).

Do not stub browser-capable HTTP clients. Native addons belong on the package `browser` export, not a Vite alias.

See monorepo [AGENTS.md](https://github.com/executioncontrolprotocol/executioncontrolprotocol/blob/main/AGENTS.md) for compile vs runtime vs app boundaries.

## Repository layout

This app is `apps/browser-demo` inside the ECP monorepo. From the repo root:

```sh
pnpm install
pnpm run build
pnpm run dev:demo
```

**Never use `file:` package links** in `package.json`. `pnpm run check:no-file-deps` enforces this.

| Symptom | Fix |
| ------- | --- |
| `Failed to resolve entry for package "@executioncontrolprotocol/browser"` | Workspace `dist/` is missing — run `pnpm run build` at the repo root |
| Port 5173 already in use | Stop extra Vite processes; Vite may fall back to 5174+ |
| `is not a function` / missing export at runtime | Package `dist/` is stale — rebuild, restart `pnpm run dev:demo` |
| Type errors after an API change | Rebuild, then `pnpm --filter @executioncontrolprotocol/browser-demo run typecheck` |

## Supabase prompt logging

User chat prompts are logged to `ecp_browser_demo_prompts`. See [`supabase/README.md`](supabase/README.md).

```sh
npx supabase login
npx supabase link --project-ref <your-project-ref>
pnpm run supabase:push
```

Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

## CI

The monorepo workflow [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) runs this app (`test:demo`, `build:demo`) on the same frozen workspace install as the rest of the repo. It does not deploy.

## Deploy (GitHub Pages)

Live demo: `https://demo.executioncontrolprotocol.io/`

Deploys on push to **`main`** via [`.github/workflows/pages.yml`](../../.github/workflows/pages.yml). Assets are built with Vite `base: "/"` for the custom domain (domain root, not `/browser-demo/`).

**Setup:** repo **Settings → Pages → Source: GitHub Actions**, custom domain `demo.executioncontrolprotocol.io`.

**Secrets for Supabase logging in production builds:**

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Local production build (same as Pages):

```sh
pnpm run build:pages
```

For a subdirectory deploy, set `VITE_BASE=/your-subpath/` before building.

Requires a workspace build (`pnpm run build` at the repo root) so browser `core/compile` exports `compileHarnessArtifactSource` (used by the coding harness).

## Spec

- [`docs/ecp-browser-demo.md`](docs/ecp-browser-demo.md) — phased plan and milestones
- [`docs/browser-demo-extensions-and-prompts.md`](docs/browser-demo-extensions-and-prompts.md) — extensions and harness wiring
- [`docs/todos.md`](docs/todos.md) — follow-ups / resolved workarounds

## Related

- **Live demo:** https://demo.executioncontrolprotocol.io/
- **Docs:** https://executioncontrolprotocol.io/
- **ECP protocol:** https://github.com/executioncontrolprotocol/executioncontrolprotocol
- **Vendor extensions:** https://github.com/executioncontrolprotocol/extensions
- **This demo:** https://github.com/executioncontrolprotocol/browser-demo
