import { mkdtempSync } from "node:fs"
import os from "node:os"
import path from "node:path"

/** Workers inherit this from the Vitest main process; it is unique per run (fallback when inject() is unavailable). */
export const REGISTRY_ENV = "ECP_TEST_PROC_REGISTRY"

/**
 * Vitest global setup for e2e and integration: process registry dir + final teardown.
 * @category Test
 */
export default function globalSetup({
  provide,
}: {
  provide: (key: "ecpTestProcRegistry", value: string) => void
}): () => Promise<void> {
  const registryDir = mkdtempSync(path.join(os.tmpdir(), "ecp-test-procs-"))
  provide("ecpTestProcRegistry", registryDir)
  process.env[REGISTRY_ENV] = registryDir
  return async () => {
    const { runGlobalHostProcessTeardown } = await import("./host-process-teardown.js")
    await runGlobalHostProcessTeardown(registryDir)
    delete process.env[REGISTRY_ENV]
  }
}
