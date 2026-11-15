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
}
