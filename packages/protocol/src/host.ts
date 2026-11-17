/**
 * How the supervisor was started (`host.json` / control status).
 * @category Host
 */
export type HostStartedBy = "auto" | "explicit"

/**
 * `host.json`, written by the supervisor. Mode 0600 on POSIX.
 * @category Host
 */
export interface HostFile {
  /** Always `@executioncontrolprotocol.host`. */
  schema: "@executioncontrolprotocol.host"
  /** Always `1.0`. */
  version: "1.0"
  /** Supervisor process id. */
  supervisorPid: number
  /** Current host process id. */
  hostPid: number
  /** Host HTTP port on 127.0.0.1. */
  port: number
  /** Supervisor control port on 127.0.0.1. */
  controlPort: number
  /** 32 random bytes, base64url (43 characters). */
  token: string
  /** Host package version. */
  hostVersion: string
  /** ISO-8601 time the supervisor wrote this file. */
  startedAt: string
  /** `ECP_HOME` the supervisor is using. */
  home: string
  /** Idle shutdown period in minutes (`0` = never). */
  idleMinutes?: number
  /** Whether the supervisor was auto-started or explicit `ecp host start`. */
  startedBy?: HostStartedBy
}

/**
 * `GET` control `/status` body.
 * @category Host
 */
export interface SupervisorStatus {
  /** Supervisor process id. */
  supervisorPid: number
  /** Current host process id, when one is running. */
  hostPid: number | null
  /** Host lifecycle as the supervisor sees it. */
  hostStatus: "starting" | "healthy" | "draining" | "stopped" | "failed"
  /** Restarts since the supervisor started. */
  restarts: number
  /** Why the host last restarted. */
  lastRestartReason?: string
  /** Idle shutdown period in minutes (`0` = never). */
  idleMinutes?: number
  /** How this supervisor was started. */
  startedBy?: HostStartedBy
  /** ISO time of last host activity that resets idle. */
  lastActivityAt?: string | null
  /** When idle stop is scheduled, or `null` when idle is off or blocked. */
  idleShutdownAt?: string | null
  /** Why idle shutdown is blocked, if any. */
  idleBlockedBy?: "run" | "stream"
}
