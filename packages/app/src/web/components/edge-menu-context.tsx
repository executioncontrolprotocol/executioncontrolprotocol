import { createContext, useContext } from "react"

/**
 * Canvas actions for route and data edge menus.
 * @category App
 */
export interface EdgeMenuContextValue {
  /** Edge id under the pointer, for hover affordance. */
  hoveredEdgeId?: string
  /** Selected edge id from the route selection context. */
  selectedEdgeId?: string
  /** Selected route level index. */
  selectedLevel?: number
  openMenu: (edgeId: string, level: number, clientX: number, clientY: number) => void
}

/** @category App */
export const EdgeMenuContext = createContext<EdgeMenuContextValue | undefined>(undefined)

/** @category App */
export function useEdgeMenuActions(): EdgeMenuContextValue {
  const value = useContext(EdgeMenuContext)
  if (!value) {
    return {
      openMenu: () => {},
    }
  }
  return value
}