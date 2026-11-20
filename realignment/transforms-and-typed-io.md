# Transforms and typed inputs/outputs

**Status:** design agreed 2026-11-19; implementation plan to follow. **Origin:** dogfooding the PSD examples
(`examples/psd-layers`, `examples/psd-generate-background`) showed three problems: workflows reshaped data inline
with `$expr` markers hidden in step inputs, one example borrowed the test plugin's `echo` as a placeholder node just to
commit a computed value, and capabilities returned raw API response envelopes that every downstream step had to dig
into (`outputs[0].image.url`).

## Principles

1. **Nodes do all the work, including transforms.** A transformation is a node in the graph, never a hidden
   expression on an edge. No placeholder nodes whose only job is to move a value into state.
2. **Data edges are `$ref` only.** A step receives data from earlier outputs through `$ref` bindings, which are visible
   edges, typed, and checked by validation (L3).
3. **Expressions drive control only.** `expr` on branch arms, loop conditions and step gates returns a boolean. It
   never reshapes data.
4. **Every node has a typed boundary** (`accepts` / `returns`). For a capability, the boundary is declared in the
   capability's own schema (`ecp.schema.json`) and never repeated in the workflow. A transform's contract depends on
   its use, so a transform step declares its own `accepts` / `returns`, the same way `execution.accepts` /
   `execution.returns` do for the whole workflow.
5. **`returns` describes what a capability produces, not the API's response envelope.** A manifest call produces a
   JSON document: `returns` is an object. An image generation call produces images: `returns` is images
   (`FileRef`s), not job JSON. The OpenAPI response schema is the hint for where the product lives; the plugin turns
   it into the meaningful output. The same applies to inputs: a capability that consumes an image accepts a `FileRef`
   and builds the provider's request envelope itself.
6. **Prefer primitive outputs.** Ports carry the most specific type available (strings, integers, arrays of strings,
   `FileRef`s) so connections between nodes are meaningful and checkable.

## Decisions

| # | Decision |
| --- | --- |
| D1 | **Remove inline `$expr` from step inputs.** Data reaches a step only through `$ref` (and `$state` handles). Validation rejects `$expr` in `input` with a hint to use a transform step. Nothing is published yet, so there are no users to migrate beyond the repo's own examples and fixtures (14 uses). |
| D2 | **Keep `$script`.** It is how a transform step gets its code (by `path` or `source`) and how Photoshop UXP scripts are passed; it is code passed as data, not a data transformation. `$script.params` stays. |
| D3 | **Transform steps declare `accepts` and `returns`** (JSON Schema, `type: object`). `accepts` names and types the inputs; `input` binds each with `$ref` (checked against `accepts`); the script reads `input.<name>`. No `ref()` inside scripts: every dependency is a visible edge. `returns` is required; `"returns": {}` is the explicit "any" escape hatch. The host validates the script's result against `returns` at run time and fails the step on a mismatch. |
| D4 | **Transforms are capability steps (option A),** not a new node kind. `@executioncontrolprotocol/core.transform` (JavaScript in the QuickJS sandbox, code from `$script`) lives in a new first-party **core plugin installed by default**. JSONata is a **separate optional plugin** whose transform capability takes an `expression` instead of `script`, with the same step-declared contract. |
| D5 | **Only capabilities that opt in accept step-level `accepts`/`returns`.** A capability's manifest marks its contract as step-defined; for those, both fields are required on the step. On any other capability step, step-level `accepts`/`returns` are a validation error. |
| D6 | **Capability outputs and inputs are product-shaped.** Media outputs are `FileRef`s with a `mediaType` (e.g. Firefly `generate-images` → `{ images: FileRef[] }` with seeds; Photoshop composite → one `FileRef` per requested output, keyed by media type). Media inputs accept `FileRef`. JSON-document outputs (e.g. `generate-manifest`) stay objects, with a real schema where the shape is known. |

## Example: `psd-layers` after the change

```json
{
  "id": "names",
  "uses": "@executioncontrolprotocol/core.transform",
  "accepts": {
    "type": "object",
    "properties": { "manifest": { "type": "object" } },
    "required": ["manifest"]
  },
  "returns": {
    "type": "object",
    "properties": {
      "names": { "type": "array", "items": { "type": "string" } },
      "ids": { "type": "array", "items": { "type": "integer" } },
      "count": { "type": "integer" }
    }
  },
  "input": { "manifest": { "$ref": "state.manifest" } },
  "script": { "$script": { "lang": "js", "path": "scripts/layer-names.js" } },
  "as": "layers"
}
```

## Details settled in the implementation plan

- **Step shape:** `script` is a step-level field next to `input` (for JSONata, a step-level `expression`). A transform's
  `$script` takes no `params`; data enters only through `input`.
- **D5 flag:** the capability row in `ecp.manifest.json` carries `contract: "step"` and `code: "script" | "expression"`.
- **Who runs scripts:** for `code: "script"` the executor runs the script in QuickJS under host sandbox limits; the core
  plugin only registers the capability and carries the flag. The host never switches on a capability id.
- **Output keys for media:** state paths can't contain `/`, so multi-output capabilities key `FileRef`s by a token
  derived from the media type (`image/png` → `png`, `image/jpeg` → `jpeg`, `image/vnd.adobe.photoshop` → `psd`,
  `application/pdf` → `pdf`; otherwise the MIME subtype with non-identifier characters replaced by `-`). Each
  `FileRef` keeps its `mediaType`. When the caller requests the same type twice (`outputs[]` in the composite request),
  keys repeat with a numeric suffix (`png`, `png2`, …). The runtime pairs polled response entries with request
  `outputs[]` by index, then keys the shaped result by that token.
- **Adobe inputs accept `url` FileRefs only.** A local `file` or run `artifact` is rejected with a hint to upload it
  first (the PSD examples upload to Azure and pass a `url` FileRef).
- **Cleanup:** the PSD examples delete the uploaded *input* copy of the template after Adobe has read it; Adobe hosts the
  outputs separately, so deleting the input never affects them.

## Gap (rough order)

1. Core plugin + `core.transform` with step-declared contracts (D3–D5): protocol and schemas, validation (L1–L3),
   executor run-time output check, App typed ports and a node-panel script editor, specs 02, 04, 08, 11.
2. Optional JSONata plugin (D4).
3. Remove inline `$expr` from inputs (D1); migrate examples and fixtures; the App's edge inspector keeps route `expr`
   editing and drops data `$expr` editing.
4. Product-shaped Firefly/Photoshop inputs and outputs (D6), guided by the OpenAPI response schemas; update both PSD
   examples to connect `generate.images[0]` to the composite's background directly.
5. Independent: an Azure `delete` capability so example uploads don't pile up.
