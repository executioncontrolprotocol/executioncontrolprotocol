import { createContext, useContext } from "react"

/**
 * Routed SVG path `d` per data edge id (tunnel routing); missing ids use a plain bezier.
 * @category App
 */
export const BranchRoutingContext = createContext<ReadonlyMap<string, string>>(new Map())

/**
 * Resolved branch path for one edge, if tunnel routing computed one.
 * @category App
 */
export function useBranchRoute(edgeId: string): string | undefined {
  return useContext(BranchRoutingContext).get(edgeId)
}