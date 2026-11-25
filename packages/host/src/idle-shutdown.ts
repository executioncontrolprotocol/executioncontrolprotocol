/**
 * Inputs for deciding whether an idle supervisor should stop.
 * @category Host
 */
export interface IdleShutdownInput {
  /** Configured idle period in ms; `0` means never. */
  idleMs: number
  /** ISO time of last counted activity, if any. */
  lastActivityAt: string | undefined
  /** Current time in ms. */
  nowMs: number
  /** Active runs reported by the host. */
  activeRuns: number
  /** Open watch streams on the host. */
  openStreams: number
  /** When false, idle checks are skipped. */
  hostHealthy: boolean
  /** When true, idle checks are skipped. */
  stopping: boolean
}

/**
 * Result of {@link decideIdleShutdown}.
 * @category Host
 */
export interface IdleShutdownDecision {
  /** Supervisor should run the normal stop path. */
  shouldIdleStop: boolean
  /** When shutdown is scheduled; `null` when idle is off or blocked. */
  idleShutdownAt: string | null
  /** Why the idle clock is held, if any. */
  idleBlockedBy?: "run" | "stream"
}

/**
 * Decide whether the supervisor should idle-stop and what to report on `/status`.
 * @category Host
 */
export function decideIdleShutdown(input: IdleShutdownInput): IdleShutdownDecision {
  if (input.idleMs <= 0 || input.stopping || !input.hostHealthy) {
    return { shouldIdleStop: false, idleShutdownAt: null }
  }
  if (input.activeRuns > 0) {
    return { shouldIdleStop: false, idleShutdownAt: null, idleBlockedBy: "run" }
  }
  if (input.openStreams > 0) {
    return { shouldIdleStop: false, idleShutdownAt: null, idleBlockedBy: "stream" }
  }
  if (!input.lastActivityAt) {
    return { shouldIdleStop: false, idleShutdownAt: null }
  }
  const deadline = Date.parse(input.lastActivityAt) + input.idleMs
  if (!Number.isFinite(deadline)) {
    return { shouldIdleStop: false, idleShutdownAt: null }
  }
  if (input.nowMs >= deadline) {
    return { shouldIdleStop: true, idleShutdownAt: null }
  }
  return { shouldIdleStop: false, idleShutdownAt: new Date(deadline).toISOString() }
}