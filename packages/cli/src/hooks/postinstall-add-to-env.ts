import type { Interfaces } from "@oclif/core"
import { resolve } from "node:path"
import {
  extensionIdFromPluginPackage,
  takePendingAddToEnv,
} from "../lib/add-to-env.js"
import {
  appendExtensionStubToConfigFile,
  defaultConfigPath,
} from "../lib/config-file.js"

interface PostinstallOptions {
  plugin?: {
    name?: string
    root?: string
    pjson?: Record<string, unknown>
  }
}

/**
 * After `plugins install --add-to-config`, append a commented extension stub to the
 * config file. Does nothing when the flag was not passed.
 * @category CLI
 */
export default async function postinstallAddToEnv(
  this: { config: Interfaces.Config },
  options: PostinstallOptions
): Promise<void> {
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
