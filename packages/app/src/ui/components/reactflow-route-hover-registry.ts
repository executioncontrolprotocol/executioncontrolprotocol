import { createContext, type Dispatch, type SetStateAction } from "react"

/** Midpoint hover pill state for a route edge. @category App */
export interface RouteHoverState {
  /** Edge id. */
  edgeId: string
  /** Flow-space midpoint X. */
  labelX: number
  /** Flow-space midpoint Y. */
  labelY: number
  /** Route subtype. */
  route?: string
  /** Branch when badge. */
  whenBadge?: string
  /** Loop until badge. */
  untilBadge?: string
  /** Optional label. */
  label?: string
  /** Loop-back marker. */
  loopBack?: boolean
}

/** Registry for the active route hover pill. @category App */
export const ReactFlowRouteHoverRegistryContext = createContext<
  Dispatch<SetStateAction<RouteHoverState | null>> | null
>(null)
