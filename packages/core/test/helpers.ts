import type { Ecp } from "../src/environment/ecp.js"
import {
  environment,
  defineEnvironment,
  getEnvironmentDefinition,
  registerEnvironmentDefinition,
  NODE_ENVIRONMENT_ID,
  InMemoryRuntimeExecutor,
  extension,
} from "../src/index.js"
import type { ExtensionBindingBuilder } from "../src/bindings/extension.js"
import { testExtension } from "../src/testing/test-extension.js"

function ensureInMemoryNodeEnvironment(): void {
  if (getEnvironmentDefinition(NODE_ENVIRONMENT_ID)) return
  registerEnvironmentDefinition(
    defineEnvironment("@executioncontrolprotocol", "node").withExecutor(
      new InMemoryRuntimeExecutor()
    )
  )
}

/** Test environment with an in-memory node executor and the test extension bound. */
export function createTestEnvironment(id = "test") {
  ensureInMemoryNodeEnvironment()
  return environment(NODE_ENVIRONMENT_ID, id).with([extension(testExtension)])
}

/** Initialized {@link Ecp} for tests (in-memory node environment + test extension). */
export async function initTestEcp(id = "test"): Promise<Ecp> {
  return createTestEnvironment(id).init()
}

/** Initialized {@link Ecp} with the in-memory node environment and optional extra extension bindings. */
export async function initEncodingTestEcp(
  extraExtensions: ExtensionBindingBuilder[] = [],
  id = "encoding-test"
): Promise<Ecp> {
  ensureInMemoryNodeEnvironment()
  return environment(NODE_ENVIRONMENT_ID, id).with(extraExtensions).init()
}
