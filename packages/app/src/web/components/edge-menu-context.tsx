import { createContext, useContext } from "react"

/**
 * Canvas actions for data branch menus.
 * @category App
 */
export interface EdgeMenuContextValue {
  /** Edge id under the pointer, for hover affordance. */
  hoveredEdgeId?: string
  /** Selected data branch id. */
  selectedEdgeId?: string
  openMenu: (edgeId: string, clientX: number, clientY: number) => void
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