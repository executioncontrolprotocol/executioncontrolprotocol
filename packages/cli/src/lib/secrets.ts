import type { ServiceContext } from "@executioncontrolprotocol/engine"
import { LocalSecrets } from "@executioncontrolprotocol/local"
import { ecpHome } from "./home.js"

/**
 * Run a function against {@link LocalSecrets} without starting a full host.
 * @category CLI
 */
export async function withSecrets<T>(fn: (secrets: LocalSecrets) => Promise<T>): Promise<T> {
  const secrets = new LocalSecrets({
    services: {
      get() {
        throw new Error("LocalSecrets does not look up other services.")
      },
      getAll() {
        return []
      },
      has() {
        return false
      },
    },
    options: undefined,
    settings: { home: ecpHome() },
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
  } as unknown as ServiceContext)
  return fn(secrets)
}
