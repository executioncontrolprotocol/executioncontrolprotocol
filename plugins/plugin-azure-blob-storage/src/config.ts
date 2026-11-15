import { azureBlobConfigSchema, type AzureBlobConfig } from "./schemas.js"

/**
 * Error with an `ECP_*` code and structured details, as the engine reports it on the step.
 * @category Plugins
 */
export function codedError(code: string, message: string, details?: Record<string, unknown>): Error {
  return Object.assign(new Error(message), { code, ...(details === undefined ? {} : { details }) })
}

/**
 * Parse the resolved config object, or fail with `ECP_CONFIG_INVALID`.
 * @category Plugins
 */
export function resolveConfig(raw: unknown): AzureBlobConfig {
  const parsed = azureBlobConfigSchema.safeParse(raw)
  if (!parsed.success) {
    throw codedError(
      "ECP_CONFIG_INVALID",
      "The azure-blob-storage step needs a config object with a connectionString, or an accountName and accountKey.",
      { issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) },
    )
  }
  return parsed.data
}

/**
 * Container from the input, else the config's `defaultContainer`, else `ECP_INPUT_INVALID`.
 * @category Plugins
 */
export function resolveContainer(config: AzureBlobConfig, container: string | undefined): string {
  const name = container ?? config.defaultContainer
  if (!name) {
    throw codedError(
      "ECP_INPUT_INVALID",
      "No container: set `container` on the step input or `defaultContainer` on the config object.",
    )
  }
  return name
}
