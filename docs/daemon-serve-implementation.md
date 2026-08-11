# `ecp up` — local daemon MVP (PNA / Ollama bridge)

Status: **implementation guide** (Phase 0 of `local-daemon-bridge.md`)
Audience: CLI maintainers
Scope: the **cert-free** MVP for **Chromium (Chrome/Edge)** — a hosted or local page reaches a local ECP daemon via **Private Network Access (PNA)**, and the daemon runs Ollama through ECP `invoke`.

This is the concrete build for the MVP described in `local-daemon-bridge.md` → "MVP (Phase 0)". It intentionally needs **no TLS/cert infrastructure**; that is deferred to Phase 1 (Option C2).

---

## What this unlocks (and its limits)

Goal: `npm i -g @executioncontrolprotocol/cli`, run `ecp up`, open the demo, and Ollama "just works" — no `OLLAMA_ORIGINS`, no certs, no mixed-content workarounds. The daemon (not the page) talks to Ollama on loopback, and presents a browser-safe surface.

Honest constraints:

- **Chromium only (Chrome/Edge).** Private Network Access is a Chromium feature. Firefox/Safari do not implement it the same way — a hosted HTTPS page there will not reach the loopback daemon. This is why the demo must **feature-detect** and enable/disable the Ollama option accordingly.
- **PNA is evolving.** Today Chromium allows an HTTPS page to reach a loopback endpoint when the daemon answers the preflight with `Access-Control-Allow-Private-Network: true` (loopback is treated as potentially-trustworthy, so it is *not* blocked as mixed content the way arbitrary HTTP is). Chrome is moving this toward **Local Network Access** with a one-time **permission prompt** — acceptable UX, but watch for the transition; the header requirement or a prompt may change.
- **Local page = zero caveats.** If the page is served from `http://localhost` (Vite dev, or the daemon serving the SPA), no PNA is involved at all — plain loopback `fetch` works in every browser. PNA is only the *hosted-HTTPS-page* accelerator.

---

## Where it lives in the monorepo

| Piece | Location | Notes |
| ----- | -------- | ----- |
| New command | `packages/cli/src/commands/up.ts` | Oclif v4 command (auto-discovered from `dist/commands`) |
| HTTP server | `packages/cli/src/lib/up/` | `node:http` `createServer`, mirroring `packages/mcp` `serveHttp` |
| Ollama helpers | `@executioncontrolprotocol/extension-ollama` | `listOllamaModels`, capabilities `@executioncontrolprotocol/ollama.{generate,listModels,evaluate}` |
| Env host | `@executioncontrolprotocol/node` | `environment(...)`, `extension(...)`, `env.init()` → `Ecp` |
| Invoke | `Ecp.invoke(id).with(input).process()` | already implemented (`packages/core/src/invoke`) |

Dependency to add to `packages/cli/package.json`: `@executioncontrolprotocol/extension-ollama` (the CLI already depends on `@executioncontrolprotocol/node`).

---

## Command shape (Oclif v4)

Follows the pattern in `packages/cli/src/commands/run.ts`, but as a long-lived server (no workflow/env file required — it builds a fixed local environment internally).

```ts
// packages/cli/src/commands/up.ts  (sketch)
import { Command, Flags } from "@oclif/core"
import { createServer } from "node:http"
import { randomUUID } from "node:crypto"
import { environment, extension } from "@executioncontrolprotocol/node"
import "@executioncontrolprotocol/extension-ollama" // self-catalogs on import

export default class Up extends Command {
  static summary = "Run the local ECP daemon (bridges Ollama for the browser demo)"
  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --port 3090 --cors-origin https://demo.example.com",
  ]
  static flags = {
    port: Flags.integer({ default: 3090 }),
    host: Flags.string({ default: "127.0.0.1" }),                 // loopback only
    "ollama-url": Flags.string({ default: "http://127.0.0.1:11434" }),
    "cors-origin": Flags.string({ multiple: true, default: [] }), // + localhost dev ports
    token: Flags.string({ description: "Pairing token; auto-generated if omitted" }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Up)
    const token = flags.token ?? randomUUID()

    // Fixed local environment with Ollama bound.
    const env = (await environment("ecp-daemon")).withExtensions([
      extension("@executioncontrolprotocol/ollama").with({ baseURL: flags["ollama-url"] }),
    ])
    const ecp = await env.init()

    const allow = new Set([
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      ...flags["cors-origin"],
    ])

    const server = createServer((req, res) => void handle(req, res, { ecp, allow, token }))
    await new Promise<void>((r) => server.listen(flags.port, flags.host, r))
    this.log(`ECP daemon on http://${flags.host}:${flags.port}  (token: ${token})`)
  }
}
```

---

## HTTP surface (v1)

Narrow facade over `Ecp`, not a blind reverse proxy.

| Method | Path | Purpose | Auth |
| ------ | ---- | ------- | ---- |
| `OPTIONS` | `*` | CORS + **PNA** preflight | none |
| `GET` | `/health` | `{ ok, version, ollamaReachable }` | none (discovery) |
| `POST` | `/v1/invoke` | `{ capability, input, provider? }` → `ecp.invoke(...).with(...).process()` | Bearer token |

`/v1/invoke` maps 1:1 to the confirmed builder:

```ts
// body: { capability: "@executioncontrolprotocol/ollama.listModels", input: {...}, provider?: "..." }
const b = ecp.invoke(body.capability).with(body.input ?? {})
const result = await (body.provider ? b.uses(body.provider) : b).process()
res.end(JSON.stringify(result))
```

The demo calls `@executioncontrolprotocol/ollama.listModels` (populate the model picker) and `@executioncontrolprotocol/ollama.generate` (harness work) — the same capabilities used elsewhere, so no logic is duplicated.

---

## The headers that make PNA work

Applied on every response; the PNA line is the crux.

```ts
function setCors(req, res, allow) {
  const origin = req.headers.origin
  if (origin && allow.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)        // reflect allowlisted origin only, never "*"
    res.setHeader("Vary", "Origin")
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type")
  // Private Network Access: answer the Chromium preflight for public/secure -> loopback.
  if (req.headers["access-control-request-private-network"] === "true") {
    res.setHeader("Access-Control-Allow-Private-Network", "true")
  }
}
// OPTIONS -> setCors(...) then res.writeHead(204).end()
```

Security invariants: bind `127.0.0.1` only; Bearer token on `/v1/*`; reflect only allowlisted origins (never `*` with a token); `/health` may be unauthenticated for discovery but returns no secrets.

---

## Demo-side detection (enable/disable the Ollama menu)

Exactly the UX you want — a quick probe drives the menu:

```ts
async function detectBridge(base = "http://127.0.0.1:3090") {
  try {
    const r = await fetch(`${base}/health`, { method: "GET" })   // triggers PNA on Chromium
    if (!r.ok) return { available: false }
    const h = await r.json()
    return { available: true, ollamaReachable: h.ollamaReachable }
  } catch {
    return { available: false }   // no daemon, or non-Chromium blocking PNA
  }
}
// available && ollamaReachable -> show "Ollama (local)"; else hide/disable with a hint.
```

On non-Chromium browsers the probe simply fails → the Ollama option is hidden and the demo falls back to Chrome AI / hosted providers. No error, no user confusion.

---

## Build / test / ship

1. Add `@executioncontrolprotocol/extension-ollama` to `packages/cli/package.json`; `npm run build` (tsc project refs).
2. `npm start -w @executioncontrolprotocol/cli -- up` (runs `bin/dev.js up`) or `npm link` then `ecp up`.
3. Unit: CORS allowlist reflection; PNA header on preflight; token reject; invoke mapping.
4. Manual: local Vite page → `fetch /health` (any browser); hosted HTTPS page on **Chrome/Edge** → `fetch /health` succeeds (PNA); confirm model list + generate.
5. Docs: quickstart (`ecp up` → open demo → pick local model) + a note that this path is Chromium-only and that `OLLAMA_ORIGINS` is no longer needed.

---

## After the MVP

- Broaden the `invoke` surface (filesystem, local scripting) — same server, same `/v1/invoke`, more bound capabilities.
- Phase 1: per-device DNS-01 certs (Option C2 in `local-daemon-bridge.md`) for a cross-browser hosted-page path (Strata-operated minting).
- Keep the shape ECP-native: the daemon is "an ECP environment exposed over HTTP," so anything added lands as ECP capabilities/extensions first (never Strata-only, never a forked runtime).
