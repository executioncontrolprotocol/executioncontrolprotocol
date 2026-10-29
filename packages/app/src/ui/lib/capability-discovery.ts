import type { ReactFlowPort } from "../../graph/index.js"
import type { PortTypeSource } from "./step-connect.js"

/** Handle the user dragged from when dropping on empty canvas. @category App */
export type DiscoveryHandleType = "source" | "target"

/** Origin of a drop-on-pane capability search. @category App */
export interface CapabilityDiscoveryOrigin {
  /** Node id the drag started on (step id or Inputs/Outputs). */
  nodeId: string
  /** Handle id on that node. */
  handleId: string
  /**
   * `source` = new step is the connection target (downstream).
   * `target` = new step is the connection source (upstream).
   */
  handleType: DiscoveryHandleType
  /** Port type of the dragged handle, used to pick the first matching port. */
  port: PortTypeSource & { required?: boolean }
}

/**
 * Whether a finished React Flow connection should open capability discovery.
 * Only empty-pane drops (no target node) with a real origin handle qualify.
 * @category App
 */
export function shouldOpenCapabilityDiscovery(args: {
  /** Graph is not editable. */
  readOnly: boolean
  /** Origin node id from the connection. */
  fromNodeId?: string | null
  /** Origin handle id from the connection. */
  fromHandleId?: string | null
  /** Target node id when the drop landed on a node. */
  toNodeId?: string | null
}): boolean {
  if (args.readOnly) return false
  if (!args.fromNodeId || !args.fromHandleId) return false
  if (args.toNodeId) return false
  return true
}

/**
 * Build a discovery origin from a finished connection plus the origin port.
 * @category App
 */
export function discoveryOriginFromConnection(args: {
  /** Origin node id. */
  fromNodeId: string
  /** Origin handle id. */
  fromHandleId: string
  /** Origin handle type (`source` or `target`). */
  fromHandleType: DiscoveryHandleType
  /** Port looked up on the origin node. */
  port: ReactFlowPort
}): CapabilityDiscoveryOrigin {
  return {
    nodeId: args.fromNodeId,
    handleId: args.fromHandleId,
    handleType: args.fromHandleType,
    port: {
      typeLabel: args.port.typeLabel,
      valueSchema: args.port.valueSchema,
      required: args.port.required,
    },
  }
}
