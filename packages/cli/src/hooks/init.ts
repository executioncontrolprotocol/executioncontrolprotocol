import type { Hook } from "@oclif/core"
import { ensureHomeLayout, maybeWarnLegacyPluginDir } from "../lib/home.js"

/**
 * oclif init: ensure ECP_HOME / ECP_DATA_DIR exist and emit the one-time legacy notice.
 * Data dir itself is applied in `bin/setup-env.js` before Config.load.
 * @category CLI
 */
const hook: Hook<"init"> = async function () {
  ensureHomeLayout()
  maybeWarnLegacyPluginDir()
}

export default hook
