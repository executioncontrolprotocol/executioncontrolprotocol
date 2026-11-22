---
"@executioncontrolprotocol/adobe-firefly-services": minor
"@executioncontrolprotocol/engine": patch
---

Product-shaped Firefly and Photoshop capability I/O: media outputs become url `FileRef`s (with `mediaType`), manifest returns the layer document, and image inputs accept url `FileRefs` only. Engine validates capability `returns` with Ajv when schemas are present.