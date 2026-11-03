import type { Interfaces } from "@oclif/core"
import { resolve } from "node:path"
import { getHost } from "@executioncontrolprotocol/plugin-sdk"
import {
  extensionIdFromPluginPackage,
  takePendingAddToEnv,
} from "../lib/add-to-env.js"
import {
  appendExtensionStubToConfigFile,
  defaultConfigPath,
} from "../lib/config-file.js"
import { writeGlobalCapabilityTypes } from "../lib/capability-types.js"

interface PostinstallOptions {
  plugin?: {
    name?: string
    root?: string
    pjson?: Record<string, unknown>
  }
}

/**
 * After `plugins install`, rebuild the host when possible and refresh global
 * editor types. When `--add-to-config` was passed, also append a commented
 * extension stub to the config file.
 * @category CLI
 */
export default async function postinstallAddToEnv(
  this: { config: Interfaces.Config },
  options: PostinstallOptions
): Promise<void> {
  try {
    let host = getHost()
    if (host.rebuild) {
      host = await host.rebuild()
    }
    writeGlobalCapabilityTypes({ registry: host.registry })
  } catch {
    // Host may not be ready in every hook context; `ecp workflows types` rebuilds.
  }

  const target = takePendingAddToEnv()
  if (target === undefined) return
  const plugin = options.plugin
  const name = plugin?.name
  if (!name) return
  const extensionId = extensionIdFromPluginPackage(name, plugin.pjson)
  const path =
    target === true ? defaultConfigPath(this.config.configDir) : resolve(target)
  await appendExtensionStubToConfigFile(path, extensionId)
}
