# Spike: scaling execution validation to thousands of capabilities

**Date:** 2026-11-15. **Context:** audit finding F7 (`realignment/mvp-audit-fixes.md`). The host
compiles one combined execution schema that inlines every installed capability's marker-wrapped
input schema (`packages/engine/src/validate/validate.ts`, `this.ajv.compile(schema)`), which
overflows Ajv's call stack with all 63 Firefly capabilities. Spec 03 already asks for a base
validator plus lazily compiled per-capability validators. This spike measures how far each
approach scales and whether marker wrapping is needed at all.

Synthetic capabilities are Firefly-sized: nested objects three levels deep, arrays, enums,
integers and strings, about 40 leaf fields each. Windows, Node 22, Ajv 8.20 (draft 2020-12).

## Run

```sh
node realignment/spikes/schema-scale/scale.mjs 63 20 A     # A: one combined schema (at the time of the 2026-11-15 spike)
node realignment/spikes/schema-scale/scale.mjs 5000 20 B   # B: per-plugin schemas, lazy per-capability compile
node realignment/spikes/schema-scale/scale2.mjs 5000       # C: lazy plugin loading; D: wrapped vs raw compile cost
node realignment/spikes/schema-scale/scale3.mjs            # F: raw schema + marker error filtering; G: standalone code
node realignment/spikes/schema-scale/validate-real.mjs     # real plugins and fixtures: today vs proposed (needs pnpm run build)
node realignment/spikes/schema-scale/measure-editor-1k.mjs # S4: editor root + per-plugin write at 1,000 caps
```

`scale3.mjs` part G imports Ajv's runtime helpers from the generated file; if it can't resolve
`ajv/dist/runtime/*`, run it with `NODE_PATH` pointing at the `node_modules` folder that contains
`ajv` (for example `node_modules/.pnpm/ajv@8.20.0/node_modules`).

## Results

| # | Approach | Capabilities | Result |
| --- | --- | --- | --- |
| A | One combined schema, marker-wrapped inputs inlined (today) | 17 | compile 3.2 s, schema 501 KB, heap 320 MB |
| A | same | 63 | compile 13.7 s, 1.85 MB schema, heap 1.17 GB |
| A | same (needs `--stack-size` raised) | 200 | compile 51.8 s, 5.9 MB schema, heap 2.6 GB |
| B | Per-plugin schema documents (`$id` per plugin, `$defs` per capability), markers referenced by `$id`, all added at start, lazy per-capability compile | 63 | add 146 ms, base compile 6 ms, first use 170 ms per capability, cached 0.03 ms, heap 67 MB |
| B | same | 1,000 | add 1.5 s, base 5 ms, first use 169 ms, heap 138 MB |
| B | same | 5,000 | add 7.8 s, base 7 ms, first use 164 ms, heap 1.03 GB |
| C | B, but a plugin's schema is added only on first use of one of its capabilities | 5,000 | host start 45 ms (independent of N), first use incl. loading the plugin schema 142 ms, heap 50 MB |
| D | One capability: raw `accepts` vs marker-wrapped `accepts` | 1 | raw compile 6.5 ms; wrapped 87.6 ms; wrapped is 10.8x larger |
| F | Raw `accepts` + drop only the errors a marker position explains (incl. `anyOf`/`oneOf` branch rule) | 8 cases | 8/8 correct: markers at string/object/array/inside `anyOf` pass; typo field, bad enum beside a marker, no matching `anyOf` branch, wrong literal type all fail |
| G | Ajv standalone code generated at plugin build time (raw schemas) | 20 | 921 KB for 20 capabilities, generated in 169 ms, loaded in 171 ms; runtime compile is 7-16 ms per capability, so precompiling buys nothing |
| E | Standalone code for marker-wrapped schemas | 20 | 10 MB of generated code; not viable |

## Real data (`validate-real.mjs`)

Run from the repo root after `pnpm run build`. Uses the built engine and every real plugin and
fixture manifest (29 unique capabilities), and every step in every `fixtures/` and `examples/`
execution (96 steps in 62 files).

| Check | Result |
| --- | --- |
| Today's `HostSchemaSet.create` with all 29 capabilities | 3.1–3.5 s **per call**; it runs on every `execute`, validate and `commit` (no cache). Likely the main cause of F6's slow warm commands |
| Compile all 29 capabilities one by one | raw `accepts` 0.47 s total (max 47 ms); marker-wrapped 3.6 s total (max 1.3 s) |
| Today vs proposed, same verdict and same error locations | **96/96** steps |

The first run gave 94/96 and exposed two rules the implementation must follow (both now in the
script and in the plan):

1. **Open objects:** when an object schema doesn't set `additionalProperties: false`, an
   undeclared property accepts any value, so a `$script` there is allowed (`test.echo` in
   `fixtures/manifests/valid/markers.ecp.json`).
2. **Marker syntax is still validated:** `$script` needs `lang: "js"` and exactly one of
   `source`/`path` (`fixtures/manifests/invalid/schema-script-both.ecp.json`), checked against the
   protocol's marker schema, separately from the capability's `accepts`.

## Conclusions

1. The combined schema grows superlinearly in time and memory and can't scale; it must go.
2. Per-plugin schema documents with shared definitions referenced by `$id` keep every plugin
   independently valid and composable.
3. Loading plugin schemas lazily makes host start independent of the number of capabilities.
4. Marker wrapping is the dominant cost (13x compile time, 11x size). Validating against the raw
   `accepts` schema and filtering errors that marker positions explain is correct and cheap.
5. Precompiled (standalone) validators aren't needed.

The resulting design is recorded under F7 in `realignment/mvp-audit-fixes.md`.
