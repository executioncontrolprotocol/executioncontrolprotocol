/** Resolve Open/Save enablement from live host connectivity. */
export function resolveHostIoActions(options: {
  /** Live ecp up reachability + pairing token. */
  hostConnected: boolean
  /** Whether a workflow is loaded. */
  hasWorkflow: boolean
  /** Save in flight. */
  saveBusy?: boolean
}): { canOpen: boolean; canSave: boolean } {
  const canOpen = options.hostConnected
  const canSave = Boolean(
    options.hostConnected && options.hasWorkflow && !options.saveBusy
  )
  return { canOpen, canSave }
}
