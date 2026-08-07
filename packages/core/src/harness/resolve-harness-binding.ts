import type { HarnessId } from "@executioncontrolprotocol/types"
import type { Environment } from "../environment/environment.js"
import type { ResolvedHarnessBinding } from "../environment/bindings.js"

export type { ResolvedHarnessBinding }

/**
 * Find resolved harness binding on environment.
 * @category Harness
 */
export function findHarnessBinding(
  env: Environment,
  harnessId: HarnessId
): ResolvedHarnessBinding | undefined {
  try {
    const bindings = env.ecpResolveBindings()
    return bindings.harnesses.find((b) => b.id === harnessId)
  } catch {
    return undefined
  }
}
