import { createRequire } from "node:module"

/**
 * Package version from this package's `package.json` (single source of truth).
 * @category CLI
 */
export const VERSION: string = (
  createRequire(import.meta.url)("../package.json") as { version: string }
).version
