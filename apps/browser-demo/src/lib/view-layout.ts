import type { ViewLayoutState, ViewPanel } from "../types/workspace.js"

/** Default view state: chat only, full width. */
export const DEFAULT_VIEW_STATE: ViewLayoutState = {
  chat: true,
  workflow: false,
  code: false,
  ui: false,
}

/** Count how many panels are currently active. */
export function activeViewCount(state: ViewLayoutState): number {
  return [state.chat, state.workflow, state.code, state.ui].filter(Boolean).length
}

/** Whether the workspace column (workflow, code, or ui) should render. */
export function isWorkspaceVisible(state: ViewLayoutState): boolean {
  return state.workflow || state.code || state.ui
}

/** Whether chat and workspace are shown side by side. */
export function isPairedLayout(state: ViewLayoutState): boolean {
  return isWorkspaceVisible(state) && state.chat
}

/** Clear mutually exclusive workspace panels other than `keep`. */
function withExclusiveWorkspace(
  state: ViewLayoutState,
  keep: "workflow" | "code" | "ui"
): ViewLayoutState {
  return {
    ...state,
    workflow: keep === "workflow",
    code: keep === "code",
    ui: keep === "ui",
  }
}

/** Toggle a view panel; enforces at-least-one-active and workspace exclusivity. */
export function toggleViewPanel(state: ViewLayoutState, panel: ViewPanel): ViewLayoutState {
  if (state[panel]) {
    if (activeViewCount(state) <= 1) return state
    return { ...state, [panel]: false }
  }

  if (panel === "workflow" || panel === "code" || panel === "ui") {
    return withExclusiveWorkspace({ ...state, chat: state.chat }, panel)
  }

  return { ...state, [panel]: true }
}

/**
 * Open the authoring workspace (workflow graph) when workflow/code are not
 * already visible. Used for Open / load / Fluent edit paths — not for
 * assistant-authored workflows. Switches away from the run UI if needed.
 */
export function viewStateOpenAuthoringWorkspace(state: ViewLayoutState): ViewLayoutState {
  if (state.workflow || state.code) return state
  return withExclusiveWorkspace({ ...state, chat: state.chat }, "workflow")
}

/** Open the full-size run UI panel (clears workflow / code). */
export function openUiPanel(state: ViewLayoutState): ViewLayoutState {
  return withExclusiveWorkspace({ ...state, chat: state.chat }, "ui")
}

/** Force the workflow graph visible (clears code / ui). */
export function ensureWorkflowVisibleState(state: ViewLayoutState): ViewLayoutState {
  if (state.workflow) return state
  return withExclusiveWorkspace({ ...state, chat: state.chat }, "workflow")
}

/** CSS width class for a column based on paired vs solo layout. */
export function columnWidthClass(paired: boolean): "is-half" | "is-full" {
  return paired ? "is-half" : "is-full"
}
