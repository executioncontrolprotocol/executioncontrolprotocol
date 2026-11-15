# Post-MVP — Fluent SDK

**Not part of the MVP.** No MVP phase depends on it, and MVP code must not add Fluent
parsing, Fluent formats or Fluent-specific APIs. It's planned here so the decisions aren't lost.

## What it is

A TypeScript/JavaScript SDK that builds execution manifests (v2 JSON) in code. It runs on the
author's machine at build time and writes `.ecp.json`; the host only ever sees JSON.

## Decided direction (from the 2026-11-14 design discussion)

- **Typed step handles:** `const translation = step("@…/anthropic.generate").with({…}).as("translation")`, then `translation.out.text` produces `{ "$ref": "state.translation.text" }` and is typed from the capability's `returns`.
- **Generated types:** the host generates `ecp-capabilities.d.ts` from the installed plugin manifests (`accepts`, `returns`, descriptions) next to the editor schema; the SDK's builder types (`Val<T>`, `Out<T>`, `Step<K>`) use it. A prototype showed TypeScript catching unknown capability ids, wrong input fields, enum violations, wrong output paths ("did you mean 'text'") and output/input type mismatches.
- **`expr` / `$expr` / `$script` as real functions** whose source text is captured into the manifest; `script()` takes a typed runtime parameter (e.g. `uxp.require`) instead of free `require`, and the host's preamble adds the binding.
- **`ecp init`** writes a `jsconfig.json`/`tsconfig.json` including the generated types so editors type-check `.ecp.ts` / `.ecp.js` files.

## Later options (not decided)

- Parse-only Fluent accepted by the host (inline over MCP or by `path`), with a restricted grammar and source-mapped errors.
- A TypeScript-signature `Formatter` so `retrieve` can show capabilities as builder signatures.
- Text-edit `commit` for Fluent sources.
- Typed `state` in `expr` callbacks (handles passed in).

## Before starting

- MVP complete (Phase 9).
- Measure agent validity and token use: JSON vs SDK-authored manifests (the Phase 0 model check
  that was deferred).
