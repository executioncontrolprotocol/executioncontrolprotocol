---
"@executioncontrolprotocol/azure-blob-storage": minor
"@executioncontrolprotocol/protocol": patch
"@executioncontrolprotocol/plugin-sdk": patch
"@executioncontrolprotocol/engine": patch
"@executioncontrolprotocol/local": patch
---

Azure Blob `upload` returns a url `FileRef` on `file` (read SAS by default) instead of `blobUrl`/`sasUrl`. Publish/unpublish manifest roles record `RunRecord.publishes`.