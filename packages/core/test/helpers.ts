import type { Ecp } from "../src/environment/ecp.js"
import { environment as nodeEnvironment, NODE_RUNTIME_ID, registerNodeRuntime, runtime } from "@executioncontrolprotocol/node"
import { environment as coreEnvironment } from "../src/environment/environment.js"
import type { ExtensionBindingBuilder } from "../src/bindings/extension.js"
import { extension } from "../src/bindings/extension.js"
import { registerTestExtension } from "../src/testing/test-extension.js"
import { registerCoreFormats } from "../src/formats/register-core-formats.js"
/** Test environment with `@executioncontrolprotocol/node` runtime and test extension registered. */
export async function createTestEnvironment(id = "test", label?: string) {
  await registerCoreFormats()
  await registerTestExtension()
  const env = await nodeEnvironment(id, label)
  return env.withExtensions([extension("@executioncontrolprotocol/test").with({})])
}

/** Initialized {@link Ecp} for tests (node runtime + test extension). */
export async function initTestEcp(id = "test", label?: string): Promise<Ecp> {
  const env = await createTestEnvironment(id, label)
  return env.init()
}

/** Initialized {@link Ecp} with node runtime and optional extension bindings (encode/decode tests). */
export async function initEncodingTestEcp(
  extraExtensions: ExtensionBindingBuilder[] = [],
  id = "encoding-test"
): Promise<Ecp> {
  await registerCoreFormats()
  await registerNodeRuntime()
  const env = coreEnvironment(id)
    .withRuntime(runtime(NODE_RUNTIME_ID))
    .withExtensions(extraExtensions)
  return env.init()
}
