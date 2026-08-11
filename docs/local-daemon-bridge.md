# Local ECP daemon / desktop bridge plan

Status: **proposal** (not implemented)  
Audience: protocol maintainers, browser-demo app, CLI  
Related: browser demo Ollama provider path, `@executioncontrolprotocol/extension-ollama`, `@executioncontrolprotocol/cli`, hosted demo (e.g. GitHub Pages)

---

## Direction & decisions (2026-08-10)

These decisions reframe the effort. The Ollama bridge is **feature 1**, not the point.

1. **The daemon is the local runtime host**, a first-class peer to `node` / `browser` / `temporal` / `mcp` — not a demo bridge. Its destiny is to host a governed **local ECP environment** and expose local capabilities (models, filesystem, secrets, **local app scripting** e.g. Photoshop/InDesign) under policy. Ollama-over-loopback is just the first capability. Roadmap: model proxy → local capability host → local durable executor.

2. **API shape: ECP `invoke` from the start.** The daemon is "an ECP environment exposed over HTTP" (same pattern as the MCP adapter), not a thin Ollama facade. `POST /v1/invoke` against a fixed local environment; Ollama is the only bound capability in v1. Avoids building a facade we rebuild later.

3. **UI stays browser-side (reject Option F as primary).** The hosted browser SPA remains the UI; it talks to the local daemon. This preserves a future where **mobile / LAN devices** reach a daemon. (Product rationale: `strata-product-brief.md` in the knowledge base.)

4. **HTTPS transport: per-device DNS-01 certs (Option C2), modeled on Tailscale / Plex `plex.direct`.** Keys generated **on-device** (never shared), a name like `<device-id>.local.<domain>` resolves to `127.0.0.1` (and later LAN IP), publicly-trusted cert minted per device via ACME DNS-01, auto-rotated. **Reject C1 shared-key** as a shipped default (leak → impersonation on hostile networks). Phase 0 = Option A (loopback HTTP + Private-Network-Access header) to unblock local Vite and possibly desktop Chrome.
   - Why not OAuth-style loopback for the data path: OAuth loopback works because it's a **top-level redirect**, not `fetch`. The daemon needs persistent `fetch` from an HTTPS page → that needs a real cert (or fragile PNA). Loopback-redirect is still the right pattern for the **auth callback** (below), just not for ongoing API calls.

5. **Two runtimes / two custody, same manifest.** Desktop = local daemon runtime + local token custody (`os.secrets`). Mobile / unattended / teams = cloud runtime + cloud vault (`strata.vault`). **Custody = which secrets provider the environment binds; the manifest never changes.**

6. **Conversational, agent-initiated auth.** The agent/chat initiates OAuth (Authorization Code + PKCE), launches a browser; the **human consents in the real browser** (agent never sees credentials); the token is delivered to the daemon via **loopback redirect** (desktop, no cert needed) or to a **hosted HTTPS callback** (mobile/cloud). The OAuth **app registrations (client IDs, redirect URIs) are owned centrally** (a Strata-operated asset); both paths reuse them.

7. **ECP/Strata split (never diverge).** ECP ships the daemon, loopback HTTP, the `invoke` surface, the ACME/DNS-01 client, `os.secrets` custody, and BYO-cert flags — all open. **Strata** operates the managed **cert-minting + pairing service** and the **cloud vault** (`strata.vault` provider) — cloud-only *bindings*, never cloud-only *manifest semantics*. Any new capability lands in **ECP first** (versioned extension/plugin), then Strata consumes it.

8. **Strategy: OSS/local-first, Temporal-style.** ECP-local is the free, standalone-valuable runtime (dev-led adoption); Strata is "ECP hosted, plus plus" (same runtime + cloud vault + teams + always-on + mobile + conversational authoring for non-devs). See `ecp-positioning.md`, `strata-product-brief.md`.

## Why this is a product feature, not demo plumbing

The kicker is the **local daemon as the local `invoke` surface, driven from the app**. This is what moves the daemon from "cool demo trick" to a valuable, differentiated product capability:

- The app (dev SDK, or Strata's conversational UI) authors a workflow and runs it against a **local ECP environment** — models, filesystem, secrets, and **local application scripting** (Photoshop/InDesign, shell, data transforms) — all under ECP policy/governance.
- This is the thing connector-based automation (Zapier/n8n) structurally cannot do: reach host-native surfaces and custom scripts as first-class, governed steps.
- Same manifest and runtime as cloud; only custody and reach differ, by binding (Direction & decisions #5).

## MVP (Phase 0) — no cert infrastructure required

**Key realization: cert infrastructure (C2) exists solely to let a *hosted HTTPS* page `fetch` the local daemon. Avoid that one combination and no certs are needed.** The MVP keeps the **page origin local**, which proves the product feature with zero cert work.

Scope:

- `ecp up` on `127.0.0.1` — plain HTTP, **ECP `invoke`** shape (`POST /v1/invoke` against a fixed local environment), pairing token, CORS allowlist for local origins, `GET /health`.
- App runs **locally**, one of:
  - Vite dev / local build on `http://localhost:5173` (dev/OSS), or
  - the daemon serves the SPA on its own origin `http://127.0.0.1:<port>/` (self-contained), or
  - a thin desktop shell (Tauri/Electron) for a product feel (more work).
- Page is HTTP-local, so `fetch` → `http://127.0.0.1` daemon is **not** mixed content — works with **no certs**.
- OAuth via **loopback redirect** works cert-free (top-level navigation).
- First bound capability: Ollama (`@executioncontrolprotocol/ollama.*`) via `invoke`; architecture ready for filesystem / local scripting next.

Explicitly out of MVP scope:

- Letting the **hosted** GitHub-Pages/HTTPS demo talk to the daemon. That is the only thing requiring C2, and it defers to Phase 1 — naturally a Strata-operated convenience for non-devs.

Cheap bonus (do not depend on it): on desktop Chrome/Edge a hosted HTTPS page *may* reach the loopback daemon via Private Network Access (`Access-Control-Allow-Private-Network: true` on the preflight), cert-free. Chrome/Edge-only, evolving — a bonus, not the plan. **For a Chromium-primary demo this bonus is promoted to the MVP transport** — concrete build guide: [`daemon-serve-implementation.md`](daemon-serve-implementation.md) (`ecp up` command, PNA headers, `/v1/invoke` over the Ollama capabilities, and demo-side feature detection to enable/disable the Ollama menu).

Strategic fit: the zero-cert local MVP **is** the OSS/dev-first experience (run it locally). The hosted-page → local-daemon convenience (C2 minting) is later Strata polish for non-devs, so cert infra defers cleanly to the monetization phase.

## Problem

The browser demo can call a **local Ollama** instance for Fluent/coding harness work. That works well when:

- the UI is served from `http://localhost:5173` (or similar), and
- Ollama is on `http://127.0.0.1:11434`, and
- the user sets `OLLAMA_ORIGINS` so Ollama’s CORS allowlist includes the Vite origin.

It does **not** work cleanly for a **hosted HTTPS demo** (GitHub Pages, production site) talking to Ollama on the user’s machine:

| Barrier | What happens |
| ------- | ------------ |
| **CORS** | Ollama only allows limited origins by default (`127.0.0.1` / `0.0.0.0`). Arbitrary site origins must be listed in `OLLAMA_ORIGINS`. |
| **Mixed content** | An `https://` page cannot `fetch` `http://127.0.0.1:11434`. CORS configuration cannot fix this; the browser blocks the request first. |
| **UX / support** | Asking every user to configure `OLLAMA_ORIGINS` (and understand mixed content) does not scale for a public demo. |

### Goal

Install the **ECP CLI locally** as a long-lived **desktop bridge** (`ecp up` / daemon) so that:

1. The hosted (or local) browser UI talks to a **local ECP endpoint**, not directly to Ollama’s HTTP API.
2. HTTPS Pages can use local models without teaching users Ollama CORS.
3. The same bridge can later expose other local capabilities (filesystem, secrets, local env bind) under ECP control.

Non-goals for v1:

- Replacing Ollama itself
- Exposing Ollama on the public internet
- Making every ECP capability require the daemon
- Shipping a full native desktop app (extension optional later)

---

## Current architecture (no bridge)

```text
Browser demo (page origin)
        │  fetch (browser CORS + mixed-content rules)
        ▼
Ollama :11434  (/api/tags, /api/chat)
```

- Extension: `@executioncontrolprotocol/extension-ollama` (`listOllamaModels`, `generate`, …)
- Demo settings: base URL + model listing via `/api/tags`
- Local Vite: workable with `OLLAMA_ORIGINS`
- Hosted HTTPS: blocked by mixed content even if CORS were wide open

---

## Target architecture (with bridge)

```text
Hosted demo (https://…)  ──HTTPS──►  local.ecp… / 127.0.0.1 daemon
                                            │
                                            ├─► Ollama :11434 (loopback)
                                            ├─► (future) local env / secrets / fs
                                            └─► health, pairing, CORS allowlist
```

The page never talks to Ollama’s origin. The daemon speaks Ollama on loopback and presents a browser-safe surface to the UI.

---

## Option catalog

### Option A — HTTP loopback daemon only

**Idea:** `ecp up` binds `http://127.0.0.1:<port>`, proxies or re-exposes Ollama/ECP invoke. Demo (HTTP local) sets CORS to Vite origin.

| | |
| - | - |
| **Pros** | Simplest to implement; enough for local Vite; no cert/DNS infra |
| **Cons** | Does **not** fix hosted HTTPS → HTTP mixed content; still need CORS for any non-null origin |
| **Best for** | Phase 0 / local-dev bridge while designing HTTPS |

#### Implementation sketch

- CLI: `ecp up [--port 3090] [--token …]`
- Routes: `GET /health`, `GET /v1/ollama/tags`, `POST /v1/ollama/chat` (or ECP-shaped invoke)
- Bind **only** `127.0.0.1`
- `Access-Control-Allow-Origin` for configured demo origins + `localhost` Vite ports
- Require `Authorization: Bearer <pairing-token>` (token printed once / stored in user config)

---

### Option B — HTTPS on loopback with local CA (mkcert / trust-on-first-use)

**Idea:** Same daemon, TLS with a **locally trusted** certificate (`localhost` / `127.0.0.1`).

| | |
| - | - |
| **Pros** | Fixes mixed content for `https://127.0.0.1` if the cert is trusted; no public DNS; private keys stay on machine |
| **Cons** | Requires CA install (`mkcert -install`) or scary self-signed accept UX; poor “open Pages and it just works” story; enterprise locked-down machines may block local CAs |
| **Best for** | Power users, corporate laptops with IT-approved local CA, optional advanced mode |

#### Implementation sketch

- Document: install mkcert, `mkcert localhost 127.0.0.1`, point `ecp up --tls-cert … --tls-key …`
- Or: daemon generates self-signed; first-run opens `https://127.0.0.1:port/trust` instructions
- Demo probes `https://127.0.0.1:3090/health`

---

### Option C — Public DNS name → `127.0.0.1` + publicly trusted cert (DNS-01)

**Idea:** Own a hostname such as `local.executioncontrolprotocol.dev` (and optionally `*.local.…`) whose **A record is `127.0.0.1`**. Issue a **publicly trusted** TLS cert for that name using **ACME DNS-01** (not HTTP-01). Ship or fetch the cert for the local daemon. Hosted Pages call `https://local.…:3090`.

```text
DNS:  local.example.com  A  127.0.0.1
ACME: DNS-01 TXT proof on example.com  →  cert for local.example.com
Browser: https://pages…  →  https://local.example.com:3090  →  user machine
```

#### Why DNS-01 (not HTTP-01)

| Challenge | Works for A→127.0.0.1? | Reason |
| --------- | ---------------------- | ------ |
| **HTTP-01** | No | Let’s Encrypt’s validators hit *their* loopback, not the user’s daemon |
| **DNS-01** | Yes | Domain ownership is proven via TXT records; A→127.0.0.1 is irrelevant |

Public CAs also do **not** usefully issue for bare `localhost` / `127.0.0.1` names.

#### C1 — Shared wildcard / shared hostname cert

Project (or release pipeline) issues `*.local.example.com` (or a single `local.example.com`) via DNS-01, distributes cert+key with the CLI or downloads on `ecp up` start.

| | |
| - | - |
| **Pros** | Best “it just works” for HTTPS Pages; real browser trust; no user CA install |
| **Cons** | **Shared private key** across installs (supply-chain and abuse risk); must rotate; must assume key will leak; requires strong daemon auth and loopback-only bind |
| **Mitigations** | Short-lived certs (days/weeks); automated rotation endpoint; token pairing; rate limits; revoke on incident; never bind `0.0.0.0` |

#### C2 — Per-user / per-machine short-lived certs

Backend mints `user-<id>.local.example.com` (or random subdomain) certs after device pairing; daemon fetches cert+key over authenticated channel.

| | |
| - | - |
| **Pros** | Better crypto hygiene than shared wildcard; blast radius limited |
| **Cons** | Needs online minting service, identity/pairing, renewal, revocation; more ops than C1 |
| **Best for** | Production desktop bridge if the product has accounts or device IDs |

#### C3 — User-run DNS-01 (user’s domain)

User points their own DNS at 127.0.0.1 and runs ACME themselves.

| | |
| - | - |
| **Pros** | No shared keys; user owns trust domain |
| **Cons** | Not viable for mainstream demo UX; support burden |

**Recommended within Option C:** start design around **C1 for demo/dev** with explicit security documentation; plan **C2** if the bridge becomes a supported product surface.

#### DNS / cert ops checklist (C1/C2)

1. Create zone records: `local.…` and/or `*.local.…` → `127.0.0.1` (and AAAA `::1` if desired).
2. ACME DNS-01 with provider API (Cloudflare, Route53, …) in CI or a small certbot/lego job.
3. Publish cert artifact (or mint API) consumed by CLI.
4. Monitor expiry; rotate before NotAfter.
5. Document that resolving `local.…` to loopback is intentional.

#### Daemon TLS bind

- Prefer `127.0.0.1` + SNI for `local.example.com` (and optionally `localhost`).
- Open firewall to LAN **off by default**.
- HSTS: usually **avoid** on loopback hostnames during experimentation (hard to undo in browsers).

---

### Option D — Browser extension / native messaging

**Idea:** Hosted page messages an extension; extension talks to daemon or Ollama with `host_permissions`.

| | |
| - | - |
| **Pros** | Avoids page-level mixed content; strong origin gating; familiar “desktop connector” pattern |
| **Cons** | Store review, install friction, per-browser maintenance; not “open the website only” |
| **Best for** | Optional power-user install; enterprises that already deploy extensions |

#### Implementation sketch

- MV3 extension: content script / externally_connectable for Pages origin
- Native host or `fetch` to `http://127.0.0.1` from extension context (extension pages are not subject to the same page mixed-content rule for privileged hosts, subject to browser rules and permissions)
- Pairing: extension stores token; page never sees Ollama

---

### Option E — Public HTTPS tunnel (ngrok / Cloudflare Tunnel)

**Idea:** Daemon opens an outbound tunnel; Pages calls `https://<random>.trycloudflare.com`.

| | |
| - | - |
| **Pros** | Real public cert without DNS-to-loopback tricks; works from anywhere |
| **Cons** | Ephemeral URLs, third-party dependency, easy to misconfigure into a **public Ollama**; latency; not “local only” by default |
| **Best for** | Debug / temporary demos — **not** default product path |

If used: mandatory auth, short TTL, never advertise as the primary secure design.

---

### Option F — Daemon-hosted UI (split surfaces)

**Idea:** Hosted Pages remains marketing / Chrome AI demo. “Use local Ollama” opens `https://local.…:3090/` (or `ecp open`) served by the daemon — same origin as the bridge.

| | |
| - | - |
| **Pros** | No cross-origin from Pages to daemon for the authoring UI; simplest security story for local power features |
| **Cons** | Two UIs or a redirect split; hosted demo cannot fully showcase Ollama in-page without Options C/D/E |
| **Best for** | Clear product split: public sandbox vs local studio |

---

## Comparison matrix

| Option | Fixes local Vite | Fixes HTTPS Pages → local Ollama | User install friction | Shared secrets risk | Ops complexity |
| ------ | ---------------- | -------------------------------- | --------------------- | ------------------- | -------------- |
| A HTTP loopback | Yes (CORS) | No (mixed content) | Low | Low | Low |
| B Local CA TLS | Yes | Yes if CA trusted | Medium–high | Low | Low–medium |
| C1 DNS→127 + shared cert | Yes | Yes | Low | **High** (shared key) | Medium |
| C2 DNS→127 + per-device cert | Yes | Yes | Low–medium | Medium | **High** |
| D Extension | Yes | Yes | High | Low | Medium |
| E Tunnel | Yes | Yes | Medium | Medium (public URL) | Medium |
| F Daemon-hosted UI | N/A (local UI) | N/A (leave Pages) | Low | Low | Low |

---

## Recommended phased approach

### Phase 0 — Local HTTP bridge (Option A)

Unblocks cleaner local DX and proves API shape without cert infra.

#### Deliverables

- `ecp up` with health + Ollama proxy (or ECP invoke facade)
- Pairing token + loopback bind + CORS allowlist
- Browser demo: detect bridge, prefer it over direct Ollama base URL when present
- Docs: when to use bridge vs direct `OLLAMA_ORIGINS`

### Phase 1 — HTTPS for hosted demo (prefer Option C1 or F)

Pick one primary product story:

| Story | Choice |
| ----- | ------ |
| “Open hosted demo, connect local models in-page” | **C1** (shared `local.` cert) with hard security mitigations, or **C2** if minting exists |
| “Hosted demo is sandbox; local models in local UI” | **F** (+ optional A for Vite) |

**Default recommendation for ECP near-term:**  
Phase 0 (A) + design docs for **C1**, with **F** as the low-risk product alternative if shared-key TLS is unacceptable.

### Phase 2 — Harden / productize

- C2 short-lived certs **or** extension (D) as optional installer
- Broader bridge surface: `invoke`, local env snapshot, secrets vault unlock (policy-gated)
- Telemetry: bridge version, health, pairing success (no prompt contents)

---

## Detailed implementation plan

### 1. CLI: `ecp up`

**Package:** `@executioncontrolprotocol/cli` (command) + small `@executioncontrolprotocol/local-bridge` library if we want tests without Oclif.

#### Suggested flags

```text
ecp up
  --port 3090
  --host 127.0.0.1
  --token <string>          # or auto-generate + print
  --ollama-url http://127.0.0.1:11434
  --cors-origin <url>       # repeatable; include Pages + Vite
  --tls-cert <path>         # Phase 1
  --tls-key <path>
  --tls-domain local.example.com
```

#### Lifecycle

- Foreground process first; later: Windows service / launchd / systemd user unit (optional)
- Graceful shutdown; single-instance lock on port
- Config file under user ECP config dir (token, allowed origins, ollama URL)

### 2. HTTP API surface (v1)

Prefer a **narrow facade**, not a blind reverse proxy of all Ollama routes.

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET` | `/health` | `{ ok, version, ollamaReachable }` — may be unauthenticated for discovery |
| `GET` | `/v1/ollama/models` | Wrap `listOllamaModels` |
| `POST` | `/v1/ollama/generate` | Wrap chat/generate used by harness |
| `OPTIONS` | `*` | CORS preflight |

**Alternative (more ECP-native):**  
`POST /v1/invoke` with capability id `@executioncontrolprotocol/ollama.listModels` / `.generate` and a **fixed local environment** bound inside the daemon. Pros: one invoke shape; Cons: heavier for v1.

#### Auth

- `Authorization: Bearer <token>` on all non-health routes
- Token generated on first serve; stored hashed at rest if possible
- Demo stores token in localStorage only after user pastes/pairs (or custom URL `ecp://pair?…` later)

#### CORS

- Explicit allowlist (Pages production origin, `http://localhost:5173`, `http://127.0.0.1:5173`)
- No `*` when credentials/token are used
- Reflect allowed origin only when present in allowlist

### 3. Reuse existing Ollama extension

Daemon should call the same helpers already used by the browser path:

- `listOllamaModels(baseURL)` from `@executioncontrolprotocol/extension-ollama`
- Existing generate/chat path (or shared internal client)

Avoid duplicating `/api/tags` parsing in the CLI.

### 4. Browser demo integration

#### Discovery order

1. If user enabled “Local ECP bridge” (or auto-detect): `GET https://local.…:3090/health` or `http://127.0.0.1:3090/health`
2. Else: direct Ollama base URL (current behavior) for local Vite only

#### Settings UI

- Bridge status: unreachable / needs token / ready
- “Copy pair command” / paste token
- Keep direct Ollama fields for advanced local use

#### Provider wiring

- When bridge ready: Ollama extension `baseURL` points at bridge base (or demo uses bridge client and binds generate via bridge)
- Model listing uses bridge `/v1/ollama/models` (same gating as today’s `/api/tags` flow)

### 5. TLS + DNS (Phase 1, Option C)

#### Infrastructure

- DNS A/AAAA for `local.<product-domain>` → `127.0.0.1` / `::1`
- CI job: lego/certbot DNS-01 → artifact `bridge-tls.zip` (cert, key, chain, expiry metadata)
- CLI: `ecp up` downloads or embeds cert; verifies NotAfter; warns if &lt; N days

#### Security requirements (non-negotiable for C1)

1. Bind `127.0.0.1` only by default  
2. Pairing token required for model/generate  
3. Document shared-key threat model in README  
4. Rotate certs on a schedule; publish revoke instructions  
5. Do not log prompts by default  

#### Threat notes

- Any process on the machine can connect to loopback; token raises the bar for **drive-by websites**, not for local malware.
- Shared TLS private key means an attacker with the key can **impersonate** `local.…` on another machine; browser trust is for the name, not “this is your ECP install.” Token + loopback still matter.

### 6. Tests

| Layer | Cases |
| ----- | ----- |
| Unit | CORS allowlist; auth reject; model list proxy mapping |
| Integration | Mock Ollama; `ecp up` + fetch from allowlisted Origin |
| Manual | Vite → HTTP bridge; Pages → HTTPS `local.` (Phase 1); mixed-content regression checklist |

### 7. Docs / user journey

1. Install CLI (`npm i -g @executioncontrolprotocol/cli` or platform installer)  
2. `ecp up`  
3. Open hosted demo → Connect local bridge → paste token  
4. Select model from listed tags → Continue  

Keep a short “direct Ollama + `OLLAMA_ORIGINS`” appendix for Vite-only workflows without the daemon.

---

## Security model (summary)

| Trust boundary | Control |
| -------------- | ------- |
| Random website → user’s Ollama | Do not call Ollama from page; daemon CORS allowlist + token |
| HTTPS page → local HTTP | Forbidden; use TLS (B/C) or extension/tunnel/UI split (D/E/F) |
| LAN attackers | Loopback bind only |
| Shared C1 cert leak | Rotate; token; assume name can be spoofed on other hosts |
| Prompt exfiltration | No default cloud logging of bridge traffic |

---

## Open decisions

1. ~~**Primary HTTPS story**~~ → **Resolved: C2** (per-device DNS-01, Tailscale/Plex model). See Direction & decisions #4.
2. ~~**API shape**~~ → **Resolved: ECP `invoke`.** See #2.
3. **Domain:** which registered hostname for `local.*` (e.g. `ecp.direct`, `local.executioncontrolprotocol.dev`)? — still open.
4. **Token UX:** paste-only vs custom protocol vs QR/loopback redirect? — leaning loopback-redirect for desktop auth (#6); pairing UX for cloud still open.
5. ~~**Scope creep**~~ → **Resolved: local runtime host**, not Ollama-only. v1 exposes Ollama via `invoke`; architecture targets the full local environment. See #1.
6. **Minting service ownership:** confirmed as a **Strata** operated service (#7) — implementation timing open.

---

## Decision (superseded strawman → see Direction & decisions above)

| Phase | Choice |
| ----- | ------ |
| Now (design) | This document + Direction & decisions (2026-08-10) |
| Phase 0 implement | **Option A** — `ecp up` on `127.0.0.1`, **ECP `invoke` shape**, pairing token, CORS allowlist + Private-Network-Access header. Unblocks local Vite; may unblock desktop Chrome via PNA. |
| Phase 1 hosted HTTPS | **Option C2** — per-device DNS-01 certs (on-device keys, per-device subdomain → loopback/LAN, auto-rotate). **Not** C1 shared-key. Minting service operated by Strata. |
| Later | Broader bridge surface (fs, secrets, local app scripting), local durable executor; optional **D** (extension) only as a power-user add-on. |

---

## Appendix A — Mixed content and CORS reminder

- **CORS** is enforced by the browser based on response headers from the **target** origin; Ollama/`ecp up` must allow the **page** origin.  
- **Mixed content** blocks active `http://` subresource requests from **HTTPS** pages regardless of CORS.  
- `localhost` is a [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) for many features when the **page** itself is on localhost; that does **not** allow an HTTPS **remote** page to call HTTP loopback.

## Appendix B — Related code (today)

| Area | Location |
| ---- | -------- |
| Ollama list/generate | `packages/extensions/ollama` |
| Demo Ollama settings / listing | `browser-demo` `OllamaSettingsFields`, `ollama-models.ts` |
| Browser workflow shim / compile | `packages/runtimes/browser` `installBrowserWorkflowShim`; `core/compile` `resolveImports: "browser-global"` |
| CLI | `packages/cli` (no `serve` yet) |
| MCP adapter (related “host” pattern, not a browser bridge) | `packages/mcp` |

## Appendix C — Example allowlist origins

```text
http://localhost:5173
http://127.0.0.1:5173
https://<github-pages-host>/<repo>/
https://demo.executioncontrolprotocol.dev
```

Exact production origins to be filled when the public demo URL is stable.
