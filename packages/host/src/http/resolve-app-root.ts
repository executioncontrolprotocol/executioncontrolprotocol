import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)

/**
 * Resolve the prebuilt App static root (`dist/web`), or `undefined` when missing.
 * @category Host
 */
export function resolveAppRoot(override?: string): string | undefined {
  if (override) {
    const resolved = path.resolve(override)
    return existsSync(resolved) ? resolved : undefined
  }
  try {
    const pkgJson = require.resolve("@executioncontrolprotocol/app/package.json")
    const candidate = path.join(path.dirname(pkgJson), "dist", "web")
    if (existsSync(candidate)) return candidate
  } catch {
    // Package not installed or no package.json export.
  }
  const fromHost = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../app/dist/web",
  )
  return existsSync(fromHost) ? fromHost : undefined
}
