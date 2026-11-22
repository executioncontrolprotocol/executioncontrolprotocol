---
"@executioncontrolprotocol/anthropic": minor
---

`generate` accepts `images` (FileRefs, read by the host): Claude sees them as image blocks before the prompt. JPEG, PNG, GIF and WebP up to 5 MB each; anything else fails `ECP_INPUT_INVALID` before the API call. New example `examples/psd-artboards`: reflow a PSD into new artboard sizes with a UXP script, checked against the plan from the output manifest and reviewed visually by Claude, for an agent to adjust and rerun.
