---
"@executioncontrolprotocol/app": minor
"@executioncontrolprotocol/host": minor
---

The App reads and writes executions only through retrieve and commit (draft saves and script maps). Removed the HTTP file routes `GET/PUT /v1/file` and `GET /v1/files`.