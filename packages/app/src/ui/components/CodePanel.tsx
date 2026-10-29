import { useState } from "react"
import { CONFIG_EDITOR_PATH, configFilename } from "../../host/config-source.js"
import { FluentWorkflowEditor } from "./FluentWorkflowEditor.js"
import { MonacoCodeEditor } from "./MonacoCodeEditor.js"
import { PaneTabBar } from "./PaneTabBar.js"
import { PaneToolbar } from "./PaneToolbar.js"

/** Code-pane tab: workflow Fluent vs config file. @category App */
export type CodeEditorTab = "workflow" | "config"

const EDITOR_TABS: { id: CodeEditorTab; label: string; testId: string }[] = [
  { id: "workflow", label: "Workflow", testId: "ecp-editor-tab-workflow" },
  { id: "config", label: "Config", testId: "ecp-editor-tab-config" },
]

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
  /** Read-only `config.ecp.ts` (or `--config`) source. */
  configSource?: string
  /** Absolute path of the config file; the toolbar shows the filename. */
  configPath?: string
}

/** Full-height Fluent editor pane with Workflow / Config tabs. @category App */
export function CodePanel({
  fluent,
  fluentEditorKey,
  compileError,
  onFluentChange,
  onBeautifyFluent,
  beautifyBusy = false,
  beautifyEnabled = true,
  configSource = "",
  configPath,
}: CodePanelProps) {
  const [editorTab, setEditorTab] = useState<CodeEditorTab>("workflow")

  return (
    <div
      data-testid="ecp-source"
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-container-lowest"
      id="code-drawer"
    >
      <PaneTabBar tabs={EDITOR_TABS} active={editorTab} onChange={setEditorTab} />
      <PaneToolbar>
        {editorTab === "workflow" ? (
          <>
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
          </>
        ) : (
          <>
            <span className="px-2 font-mono text-[10px] uppercase tracking-wider text-outline">
              View only
            </span>
            <span className="ml-auto truncate px-2 font-mono text-[10px] tracking-wider text-on-surface-variant">
              {configFilename(configPath)}
            </span>
          </>
        )}
      </PaneToolbar>
      {editorTab === "workflow" && compileError ? (
        <p className="border-b border-error-container bg-error-container/20 px-4 py-2 text-label text-error">
          {compileError}
        </p>
      ) : null}
      <div className="monaco-host relative min-h-0 flex-1 bg-surface-container-lowest">
        <div className={editorTab === "workflow" ? "h-full" : "hidden h-full"}>
          <FluentWorkflowEditor
            key={fluentEditorKey}
            defaultValue={fluent}
            onChange={onFluentChange}
            visible={editorTab === "workflow"}
          />
        </div>
        <div className={editorTab === "config" ? "h-full" : "hidden h-full"}>
          <MonacoCodeEditor
            path={CONFIG_EDITOR_PATH}
            value={configSource}
            readOnly
            visible={editorTab === "config"}
          />
        </div>
      </div>
    </div>
  )
}
