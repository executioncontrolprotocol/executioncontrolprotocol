/**
 * E2E/integration setup: per-test host home cleanup.
 * @category Test
 */
import { afterEach } from "vitest"
import { cleanupTrackedHostHomes } from "./host-processes.js"

afterEach(async () => {
  await cleanupTrackedHostHomes()
})