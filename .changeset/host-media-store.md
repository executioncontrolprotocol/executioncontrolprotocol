---
"@executioncontrolprotocol/core": patch
"@executioncontrolprotocol/node": patch
"@executioncontrolprotocol/browser": patch
"@executioncontrolprotocol/plugin-sdk": patch
"@executioncontrolprotocol/plugin-app": patch
"@executioncontrolprotocol/plugin-image-sharp": patch
---

Replace the removed storage capability with a host MediaStore bound via environment().use(), so file refs and artifacts persist on disk (Node) or upload to a paired host (browser).
