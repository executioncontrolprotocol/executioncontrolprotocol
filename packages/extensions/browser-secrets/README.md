# @executioncontrolprotocol/browser-secrets

Passphrase-protected encrypted secrets for browser ECP environments.

## Fluent helper

Environment bindings use `browser("KEY")`, which serializes to `{ "$browser": "KEY" }` in manifests:

```ts
import { browser, extension } from "@executioncontrolprotocol/browser"

extension("@executioncontrolprotocol/openai").with({
  apiKey: browser("OPENAI_API_KEY", { optional: true }),
})
extension("@executioncontrolprotocol/browser-secrets").with({})
```

## Storage model

| Artifact | Location | Purpose |
| -------- | -------- | ------- |
| KDF salt | `localStorage` (`ecp:browser-secrets:v1:salt`) | PBKDF2 salt |
| Verifier | `localStorage` (`ecp:browser-secrets:v1:verifier`) | Passphrase check |
| Secret index | `localStorage` (`ecp:browser-secrets:v1:index`) | Logical key list |
| Ciphertext | `localStorage` (`ecp:browser-secret:<key>`) | AES-GCM encrypted value |
| Master key | Memory only after unlock | Never persisted |

Crypto: PBKDF2 (310k iterations, SHA-256) + AES-GCM 256-bit.

## Public API

```ts
import {
  hasBrowserVault,
  isBrowserVaultUnlocked,
  setupBrowserVault,
  unlockBrowserVault,
  lockBrowserVault,
  setBrowserSecret,
  getBrowserSecret,
  deleteBrowserSecret,
  listBrowserSecretKeys,
} from "@executioncontrolprotocol/browser-secrets"
```

The browser runtime re-exports these helpers from `@executioncontrolprotocol/browser`.

## Tests

Unit tests run with Node Web Crypto and an in-memory storage mock. Browser smoke tests use Vitest browser mode (`npm run test:browser`).
