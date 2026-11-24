import { createContext, useContext } from "react"

/**
 * Highlight state for a port while a data connection is in progress.
 * @category App
 */
export type DataConnectDrag = "compatible" | "incompatible" | "idle"

/**
 * Resolves drag highlighting for a port on the canvas.
 * @category App
 */
export interface DataConnectContextValue {
  /** Port relation while dragging, or `idle` when not dragging. */
  relation: (nodeId: string, handleId: string, handleType: "source" | "target") => DataConnectDrag
}

const defaultValue: DataConnectContextValue = {
  relation: () => "idle",
}

/**
 * Active data-connection drag (from {@link GraphCanvas}).
 * @category App
 */
export const DataConnectContext = createContext<DataConnectContextValue>(defaultValue)

/**
 * Read {@link DataConnectContext}.
 * @category App
 */
export function useDataConnect(): DataConnectContextValue {
  return useContext(DataConnectContext)
}