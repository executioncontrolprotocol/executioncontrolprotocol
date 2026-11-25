import { createContext, useContext } from "react"

/**
 * Frame header interactions shared with {@link EcpFrameNode}.
 * @category App
 */
export interface FrameActionsContextValue {
  /** Select a structure by manifest id. */
  onHeaderClick: (structureId: string) => void
  /** Open the container menu at screen coordinates. */
  onOpenMenu: (structureId: string, clientX: number, clientY: number) => void
  /** Manifest structure id when its frame is selected. */
  selectedStructureId?: string
}

const noop: FrameActionsContextValue = {
  onHeaderClick: () => {},
  onOpenMenu: () => {},
}

/**
 * Context for structure frame headers (defaults to no-op).
 * @category App
 */
export const FrameActionsContext = createContext<FrameActionsContextValue>(noop)

/**
 * Read {@link FrameActionsContext}.
 * @category App
 */
export function useFrameActions(): FrameActionsContextValue {
  return useContext(FrameActionsContext)
}