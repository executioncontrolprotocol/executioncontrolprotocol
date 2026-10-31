---
"@executioncontrolprotocol/core": minor
"@executioncontrolprotocol/plugin-adobe-firefly-services": minor
"@executioncontrolprotocol/plugin-fal": minor
"@executioncontrolprotocol/plugin-sdk": patch
---

Hoist HTTP request fields to top-level capability parameters so the App and CLI can bind them. Optional `body` shallow-merges underneath those parameters. Async Adobe jobs poll internally and return the inner result document, not status/cancel capabilities or poll knobs.
