import { createContext, useContext } from "react"

/**
 * Selection state shared between the canvas and route edge pills.
 * @category App
 */
export interface RouteEdgeSelectionContextValue {
  /** Selected route edge id, when any. */
  selectedEdgeId?: string
  /** Selected level index on that edge (outer is `0`). */
  selectedLevel?: number
  /** Select a route edge and level; clears node selection upstream. */
  select: (edgeId: string, level: number) => void
}

const noop: RouteEdgeSelectionContextValue = {
  select: () => {},
}

/**
 * Context for route pill clicks (defaults to a no-op so edges render outside the provider).
 * @category App
 */
export const RouteEdgeSelectionContext = createContext<RouteEdgeSelectionContextValue>(noop)

/**
 * Read {@link RouteEdgeSelectionContext}.
 * @category App
 */
export function useRouteEdgeSelection(): RouteEdgeSelectionContextValue {
  return useContext(RouteEdgeSelectionContext)
}