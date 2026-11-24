---
"@executioncontrolprotocol/protocol": minor
"@executioncontrolprotocol/engine": minor
---

Accept optional detached steps on an execution and refuse to run them. Validation reports ECP_NODE_DETACHED while still checking those steps, and the executor rejects a non-empty detached array before any node runs.