# Files: one reference, many access methods

**Status:** design agreed 2026-11-20, revised 2026-11-21 (uniform capture, storage behind services); implementation
plan in progress. **Origin:** the transforms work (D6 in `transforms-and-typed-io.md`) made media outputs `FileRef`s,
which exposed the gaps: Firefly images were labelled with the wrong media type, a workflow script still had to rebuild
Adobe's `image.source.url` envelope, nested image fields and Firefly style/structure references are still plain URLs,
and each plugin reads files its own way.

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
5. **Every file a step produces is captured the same way.** Whether a step's output file came from a presigned URL,
   a local path, bytes or a stream, the host saves it into the run in one way, with one record shape. There is no
   special case for expiring URLs: a captured file is a captured file, whatever it came from.
6. **All run data goes through replaceable ECP services.** Run records, step records, state, events and artifacts
   are written and read only through service interfaces. The local host implements them on disk; a hosted deployment
   can swap in object storage (S3 or similar) without changing the engine, the file service or any plugin.

## Decisions

| # | Decision |
| --- | --- |
| F1 | **Rule:** principle 1 becomes a spec 08 requirement and an authoring-skill rule. Generated plugins apply it from their OpenAPI schemas, nested fields included. |
| F2 | **File service on `ctx.files`.** Activation: `bytes(ref)`, `stream(ref)`, `path(ref)` (a scratch copy when the ref isn't already a local file, removed when the step ends), `url(ref)` (passes `url` refs through; anything else fails with a "publish it first" error). Passivation: `fromBytes`, `fromStream`, `fromPath`, `fromUrl`. `read` and `writeArtifact` stay as aliases. Handlers activate on demand; the host does not prefetch. The service is built on the artifact store (F10) and never writes run files itself. |
| F3 | **Central media typing.** The service sniffs the file's first bytes and reconciles them with the declared `mediaType`: one place instead of per-plugin guesses. A mismatch is corrected and noted in the step record; a sniffed type outside a field's declared `mediaTypes` is an error. |
| F4 | **Declared access requirements.** A `FileRef` field in a capability schema can say what the handler needs, e.g. `x-ecp-file: { access: "url", mediaTypes: ["image/*"] }`. Validation (L3) checks the bound ref's kind against it, and the host checks again at run time (a transform can produce a ref L3 couldn't see): a `file` or `artifact` ref into a `url`-only field is an error suggesting a publish step. |
| F5 | **Publishing is a node.** A capability can be marked as a publisher (`role: "publish"`): it takes a `FileRef` and returns a `url` `FileRef`; cleanup capabilities are `role: "unpublish"`. Azure Blob `upload` and `delete` are the first. Each publish is recorded in the run record: what was sent, where, and when it was deleted. |
| F6 | **Uniform capture.** After a step succeeds, every `FileRef` in its output is saved into the run's artifact store, whatever its kind: a `url` is downloaded, a `file` is copied, bytes and streams written through `fromBytes` / `fromStream` are already stored, and an `artifact` ref is already there. Each captured ref gains `archive` (the artifact ref) and keeps its own `kind`, so a captured `url` can still feed a URL-only input. One record shape in the step record for all of them. A step opts out with `persist: false`. A capture that fails or exceeds the size cap is recorded with its reason and does not fail the step (the work already succeeded). |
| F7 | **QuickJS boundary:** `FileRef`s cross into scripts as plain JSON; no file access inside the sandbox. A script that returns bytes-like data (typed arrays, base64 in a `FileRef` field) fails `ECP_OUTPUT_INVALID`. |
| F8 | **No `inline` kind.** Small files still go through artifacts. |
| F9 | **Size caps only.** The file service enforces size caps per access method and for capture. There is no URL allowlist or path sandbox today; adding them is a separate design (they would break absolute paths such as `psdPath` without configured roots). |
| F10 | **Artifact store service.** A new `ArtifactStore` interface next to `RunStore` (put from a stream with media type and name, get as a stream, stat, list a run's artifacts, delete a run's artifacts) and a `ScratchSpace` for temporary local copies. Local implementations: `runs/<runId>/artifacts/` and a per-step scratch directory. Artifact URIs stay `ecp://runs/<runId>/artifacts/<name>`, independent of where the bytes live. The file service, capture (F6), the App preview route and run deletion all go through these services; nothing else touches artifact storage directly. Run logging already goes through `RunStore`; any remaining direct run-data writes move behind it. |

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
`state.background.images.0` straight into the layer's `image` field; the Firefly image and the composite outputs are
captured into the run like any other step output file.

## Gap (rough order)

1. Artifact store and scratch services (F10), then the file service core on top of them (F2, F3, F7, F9); spec 08 rule
   (F1); move Azure upload and download onto it.
2. Declared access requirements (F4) in the plugin SDK and the Firefly generator; L3 and run-time checks with the
   publish hint.
3. Publisher role (F5): Azure upload returns a `url` `FileRef` with a generated blob name; run-record publish entries;
   simplify both PSD examples.
4. Uniform capture (F6), with App previews of captured files.
5. "Everything is a file" sweep: Photoshop nested layer images, Firefly style/structure references, Azure `sas`, and
   the authoring skill.

Independent: the QuickJS memory cap. F7 keeps binaries out of the sandbox, but large JSON documents (a PSD manifest)
still go in, so the cap still needs to be enforced.
