/** Stub @executioncontrolprotocol/node for Vitest browser eval (Node runtime not used). */
export const NODE_RUNTIME_ID = "@executioncontrolprotocol/node"

export async function registerNodeRuntime(): Promise<void> {
  throw new Error("@executioncontrolprotocol/node is not available in browser eval runtime")
}
