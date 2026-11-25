/**
 * Pure matching rules for the e2e host-process registry teardown.
 * @category Test
 */
export interface HostProcessRegistryEntry {
  /** Registered OS pid. */
  pid: number
  /** Supervisor or host role. */
  role: "supervisor" | "host"
  /** Temp `ECP_HOME` for the pair. */
  home: string
  /** Absolute dist entry path for this checkout. */
  entryPath: string
  /** Process creation time in epoch ms. */
  createdAtMs: number
}

/**
 * Whether a live process may be killed for this registry entry.
 * @category Test
 */
export function shouldKillRegisteredProcess(
  entry: HostProcessRegistryEntry,
  observed: { commandLine: string; createdAtMs: number },
): boolean {
  if (!observed.commandLine.includes(entry.entryPath)) {
    return false
  }
  if (observed.createdAtMs !== entry.createdAtMs) {
    return false
  }
  return true
}