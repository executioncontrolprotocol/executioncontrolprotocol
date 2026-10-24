import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)

/**
 * Directory of `@executioncontrolprotocol/app`'s prebuilt Vite bundle.
 * React is bundled into this folder; plugin-app does not load it at run time.
 * @category App
 */
export function resolveAppWebRoot(): string {
  try {
    const pkg = require.resolve("@executioncontrolprotocol/app/package.json")
    return join(dirname(pkg), "dist", "web")
  } catch {
    return join(fileURLToPath(new URL("../../../packages/app/dist/web", import.meta.url)))
  }
}
