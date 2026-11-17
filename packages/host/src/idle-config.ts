import type { HostStartedBy } from "@executioncontrolprotocol/protocol"

const DEFAULT_IDLE_MINUTES = 15

/**
 * Resolved idle configuration for a supervisor process.
 * @category Host
 */
export interface ResolvedIdleConfig {
  /** Minutes persisted on host.json (`0` = never). */
  idleMinutes: number
  /** Effective idle period in ms (`0` = never). */
  idleMs: number
  /** Who started the supervisor. */
  startedBy: HostStartedBy
}

/**
 * Parse supervisor idle and started-by settings from the environment.
 * @category Host
 */
export function resolveIdleConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ResolvedIdleConfig {
  const startedBy: HostStartedBy = env.ECP_HOST_STARTED_BY === "auto" ? "auto" : "explicit"
  const idleMsEnv = env.ECP_HOST_IDLE_MS
  if (idleMsEnv !== undefined && idleMsEnv !== "") {
    const idleMs = Number.parseInt(idleMsEnv, 10)
  const safeMs = Number.isFinite(idleMs) ? Math.max(0, idleMs) : DEFAULT_IDLE_MINUTES * 60_000
    return {
      idleMinutes: safeMs <= 0 ? 0 : Math.ceil(safeMs / 60_000),
      idleMs: safeMs,
      startedBy,
    }
  }
  const rawMinutes = env.ECP_HOST_IDLE_MINUTES
  const idleMinutes =
    rawMinutes !== undefined && rawMinutes !== ""
      ? Number.parseInt(rawMinutes, 10)
      : DEFAULT_IDLE_MINUTES
  const minutes = Number.isFinite(idleMinutes) ? Math.max(0, idleMinutes) : DEFAULT_IDLE_MINUTES
  return {
    idleMinutes: minutes,
    idleMs: minutes <= 0 ? 0 : minutes * 60_000,
    startedBy,
  }
}