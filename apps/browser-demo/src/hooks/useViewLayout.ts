import { useCallback, useState } from "react"
import type { ViewLayoutState, ViewPanel } from "../types/workspace.js"
import {
  DEFAULT_VIEW_STATE,
  ensureWorkflowVisibleState,
  isPairedLayout,
  isWorkspaceVisible,
  openUiPanel,
  toggleViewPanel,
  viewStateOpenAuthoringWorkspace,
} from "../lib/view-layout.js"

/** Manage view panel toggles and layout flags for the app shell. */
export function useViewLayout() {
  const [views, setViews] = useState<ViewLayoutState>(DEFAULT_VIEW_STATE)

  const toggleView = useCallback((panel: ViewPanel) => {
    setViews((current) => toggleViewPanel(current, panel))
  }, [])

  const openWorkspace = useCallback(() => {
    setViews((current) => viewStateOpenAuthoringWorkspace(current))
  }, [])

  const openUi = useCallback(() => {
    setViews((current) => openUiPanel(current))
  }, [])

  const ensureWorkflowVisible = useCallback(() => {
    setViews((current) => ensureWorkflowVisibleState(current))
  }, [])

  const workspaceVisible = isWorkspaceVisible(views)
  const paired = isPairedLayout(views)

  return {
    views,
    toggleView,
    openWorkspace,
    openUi,
    ensureWorkflowVisible,
    workspaceVisible,
    paired,
  }
}
