import type { Hook } from "@oclif/core"
import { ensureHomeLayout } from "../lib/home.js"

/**
 * oclif init: ensure ECP_HOME / ECP_DATA_DIR exist and point oclif's dataDir at plugins.
 * @category CLI
 */
const hook: Hook<"init"> = async function (options) {
  const { dataDir } = ensureHomeLayout()
  // oclif plugin-plugins installs into config.dataDir; keep it on $ECP_HOME/plugins.
  Object.defineProperty(options.config, "dataDir", {
    value: dataDir,
    writable: true,
    configurable: true,
  })
}

export default hook
