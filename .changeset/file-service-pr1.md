---
"@executioncontrolprotocol/protocol": minor
"@executioncontrolprotocol/local": minor
"@executioncontrolprotocol/engine": minor
"@executioncontrolprotocol/plugin-sdk": minor
"@executioncontrolprotocol/plugin-azure-blob-storage": patch
"@executioncontrolprotocol/plugin-test": patch
---

Run files go through replaceable services: new `ArtifactStore` and `ScratchSpace` (local disk implementations; a hosted deployment can swap in object storage). `ctx.files` gains `bytes`, `stream`, `path`, `url`, `fromBytes`, `fromStream`, `fromPath` and `fromUrl` (`read` / `writeArtifact` stay as aliases); streams are real streams with size caps enforced as bytes flow; every write sniffs the media type and records corrections. Artifact names and URIs are checked so nothing can address files outside its run, and artifact refs resolve to the run their URI names. `RunStore.artifactDir` is removed (no disk paths in service contracts). Size caps live in `HostSettings.files.maxBytes`; URL fetch failures are `ECP_PROVIDER_ERROR` without the query string. No URL allowlist or path sandbox.
