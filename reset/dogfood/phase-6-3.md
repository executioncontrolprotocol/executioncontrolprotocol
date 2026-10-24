# Dogfood A task 3 — caption and Mermaid (local proof)

One local pass with the in-repo CLI, not `@next`. Same hermetic `ECP_DATA_DIR`. `plugin-ollama`
was linked; `plugin-format-mermaid` was **not** linked for the injected failure.

This is **not** a fresh Claude Code session.

## Prompt

Generate a caption with Ollama and convert the workflow to Mermaid for a PR. Start with
`format-mermaid` not installed.

## Commands

```bash
node packages/cli/bin/run.js format-mermaid encode --input reset/dogfood/03-caption.ecp.ts --json
node packages/cli/bin/run.js plugins link plugins/plugin-format-mermaid --no-install
node packages/cli/bin/run.js compile reset/dogfood/03-caption.ecp.ts --output caption.json --json
node packages/cli/bin/run.js format-mermaid encode --input caption-encode.json --json
node packages/cli/bin/run.js validate reset/dogfood/03-caption.ecp.ts --json
node packages/cli/bin/run.js run reset/dogfood/03-caption.ecp.ts --json
```

`caption-encode.json` is `{ source, sourceSchema: "@executioncontrolprotocol.workflow" }`
around the compiled manifest.

## Injected failure

Without the plugin, `--json` returned `ok: false`,
`code: ECP_PLUGINS_MISSING`,
`message: Plugin @executioncontrolprotocol/plugin-format-mermaid is not installed.`,
suggestion `ecp plugins install format-mermaid`.

## Recovery

After `plugins link`, encoding the `.ecp.ts` file failed with `ECP_INPUT_INVALID`
(the file is TypeScript, not JSON). Compile to a workflow manifest, wrap it with
`sourceSchema`, and encode again.

`--json` returned `ok: true`, `success: true`, `format: mermaid`,
`result: flowchart TD` for the caption step.

`ecp validate reset/dogfood/03-caption.ecp.ts --json` returned `valid: true`.

## Stuck points

`ecp run` of the caption workflow returned `ECP_STEP_FAILED`:
`Ollama API error: 404 for model "llama3.2"`. Ollama is reachable but the tag is not
installed. No paid Anthropic key was used. The format-plugin recovery still holds.
