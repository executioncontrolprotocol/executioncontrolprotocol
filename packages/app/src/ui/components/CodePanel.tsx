import { FluentWorkflowEditor } from "./FluentWorkflowEditor.js"
import { PanelHeader } from "./PanelHeader.js"

/** Props for {@link CodePanel}. @category App */
export interface CodePanelProps {
  /** Current Fluent source used as Monaco's remount default. */
  fluent: string
  /** Bumped when source is replaced from disk or the graph so Monaco remounts. */
  fluentEditorKey: number
  /** Load / compile diagnostics shown above the editor. */
  compileError?: string | null
  /** Called when the user edits source. */
  onFluentChange?: (value: string | undefined) => void
  /** Pretty-print from the loaded manifest. */
  onBeautifyFluent?: () => void | Promise<void>
  /** Disable beautify while a rewrite is in flight. */
  beautifyBusy?: boolean
  /** Beautify is only valid when the file can round-trip. */
  beautifyEnabled?: boolean
}

/** Full-height Fluent editor pane. @category App */
export function CodePanel({
  fluent,
  fluentEditorKey,
  compileError,
  onFluentChange,
  onBeautifyFluent,
  beautifyBusy = false,
  beautifyEnabled = true,
}: CodePanelProps) {
  return (
    <div
      data-testid="ecp-source"
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-container-lowest"
      id="code-drawer"
    >
      <PanelHeader icon="code" label="Fluent source" />
      <div className="flex items-center gap-1 border-b border-outline-variant/60 px-2 py-1">
        <span className="px-2 font-mono text-[10px] uppercase tracking-wider text-outline">
          TypeScript
        </span>
        <button
          type="button"
          onClick={() => void onBeautifyFluent?.()}
          disabled={!beautifyEnabled || beautifyBusy || !onBeautifyFluent}
          className="ml-auto rounded border border-outline-variant/80 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant hover:border-outline hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-40"
          title="Format Fluent source from the compiled manifest"
        >
          {beautifyBusy ? "Beautifying…" : "Beautify"}
        </button>
      </div>
      {compileError ? (
        <p className="border-b border-error-container bg-error-container/20 px-4 py-2 text-label text-error">
          {compileError}
        </p>
      ) : null}
      <div className="monaco-host relative min-h-0 flex-1 bg-surface-container-lowest">
        <FluentWorkflowEditor
          key={fluentEditorKey}
          defaultValue={fluent}
          onChange={onFluentChange}
        />
      </div>
    </div>
  )
}
