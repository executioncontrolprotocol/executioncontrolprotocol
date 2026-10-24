# Phase 8 — App

> Status: ✅ Done 2026-10-24 · Branch: `milestone/cli-reset` · Depends on: Phase 5 · Plan: §4.8, §8.5 ·
> PRs: #48 library, #49 plugin-app, docs#5 `guides/app`. Do not start Phase 9.
>
> **Docs:** [guides/app](https://github.com/executioncontrolprotocol/docs/blob/feat/cli-reset-docs/guides/app.mdx)
> is filled on `feat/cli-reset-docs` (not docs `main`). There is no hosted browser demo.

## Goal

`ecp app product.ecp.ts` opens a live graph of a workflow file. The agent edits the file and
the graph updates; the user edits the graph and the file updates; runs stream progress into
the graph. In this phase the App is a link to the CLI: it stores no secrets and runs nothing
itself.

## Packages

| Package | Location | Contains |
| --- | --- | --- |
| `@executioncontrolprotocol/app` | `packages/app` | React UI, the `HostAdapter` interface, the local adapter's client, and a prebuilt static bundle (`dist/web`). React is a peer dependency, only needed when used as components |
| `@executioncontrolprotocol/plugin-app` | `plugins/plugin-app` | The `ecp app` command: local server, file watcher, and the server side of the local adapter. Serves `app`'s prebuilt bundle; no React at run time |

## Tasks

### 1. Carve the UI from `pre-reset`

Copy from `pre-reset` (`git checkout pre-reset -- apps/browser-demo/src/...`) into
`packages/app/src/`.

**Keep:**

- Components:
  - Graph: `ReactFlowCanvas`, `EcpStepNode`, `EcpIoNode`, `EcpDataEdge`,
    `EdgeMenuControlOverlay`.
  - Configuration: `StepConfigureDialog`, `IoConfigureDialog`, `ConfigFieldControl`.
  - Code: `CodePanel`, `MonacoCodeEditor`, `FluentWorkflowEditor`.
  - Runs: `RunPanel`, `RunInputForm`, `RunOutputView`, `RunResultModal`, `MediaPreview`.
  - Other: `ValidationView`, `MermaidDiagramViewer`, `SplitPane`, `PanelHeader`,
    `WorkspaceColumn`, `TopAppBar` (trimmed), `StatusFooter` (trimmed).
- Hooks: `useReactFlowRunProgress`, `useSplitPane`, `useSyncNodeHandles`, `useViewLayout`.
- `lib/` files:
  - Fluent: `fluent-beautify`, `fluent-monaco-config`.
  - Runs: `reactflow-run-status`, `run-form-files`, `run-media-refs`, `run-output-view`,
    `run-progress-sync`.
  - Steps and edges: `step-configure`, `step-connect`, `io-configure`, `edge-menu`.
  - Layout: `split-pane`, `view-layout`.
  - Other: `workflow-io`, `mermaid-render`, `capability-summary`,
    `capability-execution-badge`, `file-accept`, `resolve-media-preview`.
- `packages/extensions/format-reactflow/src` → `packages/app/src/graph/`: the encoder and the
  12 run-progress hooks.

**Drop:**

- Chat: `ChatPanel`, `useChatHistory`, `chat-*`, `classify-pending-offer`,
  `demo-conversation-messages`.
- Provider and model setup: `FirstRunModal`, `ChromeInstall*`, `useChromeModelInstall`,
  `chrome-install-ui`, `OllamaSettingsFields`, `AnthropicSettingsFields`,
  `ProviderApiKeyFields`, `ollama-*`, `anthropic-settings`, `provider-mode`.
- Secrets: `VaultSetupModal`, `VaultUnlockModal`, `vault-gate`.
- File dialogs (workflows are files now): `OpenWorkflowDialog`, `SaveWorkflowDialog`,
  `DownloadWorkflowDialog`.
- Demo and in-browser host code: `demo-*`, `environment-source`, `host-workflows`,
  `host-compatibility`, `workflow-quick-starts`, `workflow-bundle`, `esbuild-wasm-bootstrap`,
  `harness-invoke-debug`, `fluent-edit-debug`, `probe-session`, `supabase`, `ecp-bridge`
  (replaced by `HostAdapter`).

`App.tsx` (about 2,050 lines) is not copied. Write a new, smaller shell around `HostAdapter`.

### 2. `HostAdapter`

```ts
export interface HostAdapter {
  load(): Promise<{ path: string; source: string; manifest: WorkflowManifest; requirements: Requirements }>
  save(source: string): Promise<void>
  watch(onChange: (next: { source: string; manifest: WorkflowManifest }) => void): () => void
  describe(): Promise<EnvironmentDescriptor>
  search(query: string): Promise<SearchResult[]>
  validate(source: string): Promise<ValidationResult>
  run(source: string, input: unknown): AsyncIterable<RunEvent>   // the --events stream
}
```

The UI only talks to `HostAdapter`. This is what keeps a later in-page adapter possible
(see [Later](later.md)).

### 3. `plugin-app` server (`ecp app [file]`)

- **Server:** `node:http` bound to `127.0.0.1` on a free port. A random token goes in the URL
  that opens the browser, reusing the pairing-token pattern from the old `ecp up`. Every
  request requires the token.
- **Endpoints** (backing the local adapter):

  | Method | Path | Purpose |
  | --- | --- | --- |
  | `GET` | `/api/source` | Current file source, manifest and requirements |
  | `PUT` | `/api/source` | Write source |
  | `GET` | `/api/describe` | Capability catalogue |
  | `GET` | `/api/search?q=` | Search capabilities |
  | `POST` | `/api/validate` | Validate source |
  | `POST` | `/api/run` | Start a run; returns a run id |
  | WS | `/api/events` | File-change notifications and run events, in one channel |

- **Watcher:** `fs.watch` with a 150 ms debounce. A file that fails to load sends the
  `ECP_WORKFLOW_LOAD` diagnostics to the UI instead of a graph, and recovers on the next
  good save.
- **Runs** go through the same host and journal as `ecp run`, so `ecp runs show` works for
  App runs too.
- Opens the default browser unless `--no-open`.
- Add `"@executioncontrolprotocol/plugin-app": "^1"` to the CLI's `oclif.jitPlugins`.

### 4. Two-way editing

- **File → graph:** each change reloads the file through the normal loader and re-renders.
- **Graph → file:** a graph edit becomes a core `patch` on the manifest, then the file is
  re-rendered with `toFluentSource()` and saved.
- **Round-trip limits:** regenerating the file loses comments and custom formatting, and
  can't express everything a hand-written file can, such as relative imports or computed
  values. When the loaded file has constructs the encoder can't round-trip, the graph opens
  **read-only**, with a banner explaining why. Files the encoder wrote are always editable.
- **Self-write loop:** ignore watcher events whose content hash matches the last write.

### 5. UI

- Apply the carried-forward preferences (§8.5): dark mode, Tailwind and shadcn, Lucide,
  Monaco and Mermaid, progressive panel reveal, workflow full-screen from the right, and the
  Solaris Slate tokens from the demo's `DESIGN.md` (copy it into `packages/app/DESIGN.md`).
- The palette shows installed capabilities from `describe`. Missing plugins inferred from the
  file are shown with the install command.

## Tests and verification

- **`app` unit tests:** graph encoding (from `format-reactflow`'s tests), the run-progress
  mapping, and the read-only detection.
- **`plugin-app` integration:**
  - Start the server against a fixture file.
  - Edit the file and get a change event within 1 s.
  - `PUT` a source and the file is updated.
  - A run streams events.
  - Requests without the token are rejected.
- **Playwright (browser project):** open the App against a fixture, change a step's
  configuration in the graph, and assert the file changed on disk.
- **Dogfood C** (§2.4 criterion 9): with Claude Code editing a workflow, the graph reflects
  every edit within a second, and a node edited in the App shows up in Claude's next read of
  the file. Record it in `reset/dogfood/phase-8.md`.

## Exit criteria

- [x] `ecp app <file>` opens a live graph after `ecp plugins link plugins/plugin-app`. JIT from
  npm cannot fully pass (`@next` unpublished); `oclif.jitPlugins` pins `"^1"`.
- [x] Two-way sync works, with read-only mode for files that can't round-trip (`canRoundTrip`).
- [x] Runs from the App use the same host, journal, and events as the CLI.
- [x] The App stores no secrets and makes no model calls itself.
- [x] Dogfood C local proof in `reset/dogfood/phase-8.md`. Claude Code live session is operator
  follow-up.
- [x] Phase status updated in `reset/README.md` and `RESET-PLAN.md` §7.

## Outcome

Phase 8 is **Done** with the corrections below.

- `@executioncontrolprotocol/app` `1.0.0-next.0`: `HostAdapter`, graph encoder (from
  `format-reactflow`), `canRoundTrip`, AppShell around the adapter, Vite `dist/web`. React is
  an optional peer. Keep-list demo components that imported dropped modules were not copied.
- `@executioncontrolprotocol/plugin-app` `1.0.0-next.0`: `ecp app` on 127.0.0.1, pairing token,
  `fs.watch` (directory, 150 ms, content-hash self-write ignore), journal-backed runs via
  `getHost()`. Does not depend on `cli` (JIT cycle) or `mcp`.
- CLI `oclif.jitPlugins` pins `"@executioncontrolprotocol/plugin-app": "^1"`. First-use JIT
  from the registry cannot pass until `@next` is published.
- Playwright round-trip runs in `pnpm run test:browser` (`app-live` project) because the
  Vitest in-browser project cannot start a Node HTTP server.
- Docs `guides/app` is on `feat/cli-reset-docs` (docs#5). Not merged to docs `main`.
- **Do not start Phase 9** from this PR.

## Risks

| Risk | Mitigation |
| --- | --- |
| Regenerating Fluent source surprises users who hand-edit | Read-only mode for files that can't round-trip, plus a clear banner. Revisit targeted text edits later if needed |
| Bundle size makes `plugin-app` heavy | It ships only the prebuilt static bundle; React and Monaco are bundled into `dist/web` at build time, not installed as dependencies |
