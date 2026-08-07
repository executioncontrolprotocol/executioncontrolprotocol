import type { EvalProviderProfile } from "../profiles/eval-provider.js"

/**
 * Matrix harness eval environment for any {@link EvalProviderProfile}.
 * Harness binding and extensions are identical; only runtime and `.uses()` provider differ.
 * @category Evals
 */
export async function createHarnessMatrixEnvironment(provider: EvalProviderProfile) {
  if (provider.runtime === "browser") {
    const { createHarnessBrowserMatrixEnvironment } = await import(
      "./create-harness-browser-matrix-environment.js"
    )
    return createHarnessBrowserMatrixEnvironment(provider)
  }
  const { createHarnessNodeMatrixEnvironment } = await import(
    "./create-harness-node-matrix-environment.js"
  )
  return createHarnessNodeMatrixEnvironment(provider)
}
