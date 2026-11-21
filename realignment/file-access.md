# Files: one reference, many access methods

**Status:** design agreed 2026-11-20; implementation plan to follow. **Origin:** the transforms work (D6 in
`transforms-and-typed-io.md`) made media outputs `FileRef`s, which exposed the gaps: Firefly images were labelled with
the wrong media type, a workflow script still had to rebuild Adobe's `image.source.url` envelope, nested image fields
and Firefly style/structure references are still plain URLs, and each plugin reads files its own way.

## Principles

1. **Anything that could be a file is a file.** A capability's `accepts` and `returns` use `FileRef` for every
   file-like value: no raw path strings, URLs or base64 fields. This applies to nested fields too (Photoshop layer
   images, Firefly style and structure references).
2. **A `FileRef` is the passive form; paths, URLs, bytes and streams are access methods.** The ref kinds stay `file`,
   `url` and `artifact`. Buffers and streams are not kinds: they can't be stored or serialized. A handler asks the
   host's file service for the form it needs (activation) and hands back whatever it produced (passivation).
3. **The host converts only where nothing leaves the machine.** Reading a local file, an artifact or a URL into bytes,
   a stream or a temp path is the host's job. Turning a local file into a URL means sending it somewhere: that is
   **publishing**, and publishing is always an explicit node in the workflow, never hidden work on an edge.
4. **QuickJS sees references, never contents.** Transform scripts and expressions can route and inspect `FileRef`s
   (`kind`, `url`, `mediaType`, `name`). File bytes never enter the sandbox; there is no file API inside QuickJS.
5. **Files outlive their URLs.** Media outputs that arrive as expiring URLs (Firefly ~1 h, Photoshop 24 h) are copied
   into the run's artifacts by default, so a finished run still points at its files.

## Decisions

| # | Decision |
| --- | --- |
| F1 | **Rule:** principle 1 becomes a spec 08 requirement and an authoring-skill rule. Generated plugins apply it from their OpenAPI schemas, nested fields included. |
| F2 | **File service on `ctx.files`.** Activation: `bytes(ref)`, `stream(ref)`, `path(ref)` (temp copy when the ref isn't already a local file, removed when the step ends), `url(ref)` (passes `url` refs through; anything else fails with a "publish it first" error). Passivation: `fromBytes`, `fromStream`, `fromPath`, `fromUrl(url, { persist })`. `read` and `writeArtifact` stay as aliases. |
| F3 | **Central media typing.** The service sniffs the file's first bytes and reconciles them with the declared `mediaType`: one place instead of per-plugin guesses. A mismatch is corrected and noted in the step record. |
| F4 | **Declared access requirements.** A `FileRef` field in a capability schema can say what the handler needs, e.g. `x-ecp-file: { access: "url", mediaTypes: ["image/*"] }`. Validation (L3) checks the bound ref's kind against it: a `file` or `artifact` ref into a `url`-only field is an error suggesting a publish step. Where the conversion is local (bytes, stream, path), the host does it before the handler runs. |
| F5 | **Publishing is a node.** A capability can be marked as a publisher (`role: "publish"`): it takes a `FileRef` and returns a `url` `FileRef`. Azure Blob `upload` is the first. Cleanup stays an explicit node too (Azure `delete`). Each publish is recorded in the run record: what was sent, where, and when it was deleted. |
| F6 | **Persist by default.** URL `FileRef` outputs with a media type are copied into run artifacts after the step, unless the step sets `persist: false`. The step record keeps both the artifact ref and the original URL. A host setting caps the size, and the artifact retention setting applies. |
| F7 | **QuickJS boundary:** `FileRef`s cross into scripts as plain JSON; no file access inside the sandbox. A script that returns bytes-like data (typed arrays, base64 in a `FileRef` field) fails `ECP_OUTPUT_INVALID`. |
| F8 | **No `inline` kind.** Small files still go through artifacts. |
| F9 | **Limits** live in the service: size caps per access method, `file` paths limited to allowed roots, URL fetches through the existing allowlist. |

## Example: `psd-generate-background` after the change

Today the example builds a blob name in a transform, uploads with a string `sasUrl` output, wraps that in a `url`
`FileRef` literal, and its layer script rebuilds `image.source.url`. After:

```json
{ "id": "publish", "uses": "@executioncontrolprotocol/azure-blob-storage.upload",
  "input": { "file": { "kind": "file", "path": { "$ref": "state.psdPath" } } }, "as": "published" },
{ "id": "composite", "uses": "@executioncontrolprotocol/adobe-firefly-services.photoshop-composite",
  "input": { "image": { "$ref": "state.published.file" }, "edits": { "layers": { "$ref": "state.layers.layers" } } } }
```

The upload returns `file` (a `url` `FileRef`) and picks a unique blob name itself; the `layers` transform puts
`state.background.images.0` straight into the layer's `image` field; the composite outputs land as artifacts.

## Gap (rough order)

1. File service core (F2, F3, F7, F9), spec 08 rule (F1); move Azure upload and Anthropic image inputs onto it.
2. Declared access requirements (F4) in the plugin SDK and the Firefly generator; L3 check with the publish hint.
3. Publisher role (F5): Azure upload returns a `url` `FileRef` with a generated blob name; run-record publish entries;
   simplify both PSD examples.
4. Persist by default (F6), with App previews of artifact outputs.
5. "Everything is a file" sweep: Photoshop nested layer images, Firefly style/structure references, the Anthropic and
   Azure schemas, and the authoring skill.

Independent: the QuickJS memory cap. F7 keeps binaries out of the sandbox, but large JSON documents (a PSD manifest)
still go in, so the cap still needs to be enforced.
