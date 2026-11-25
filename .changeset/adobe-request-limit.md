---
"@executioncontrolprotocol/adobe-firefly-services": minor
---

Optional `maxRequestsPerMinute` config: job submissions and other non-GET requests are spaced evenly, shared across
steps and runs in the host per client id, endpoint and limit. Status polls are not counted.
