import type { OperationDefinition } from "@executioncontrolprotocol/plugin-sdk"
import { describeOperation, invokeOperation, searchOperation } from "./catalog.js"
import { discoverOperation } from "./discover.js"
import { initOperation } from "./init.js"
import {
  pluginsBuildOperation,
  pluginsCheckOperation,
  pluginsNewOperation,
} from "./plugins.js"
import { rollbackOperation } from "./rollback.js"
import {
  configSecretsAddOperation,
  configSecretsGetOperation,
  configSecretsListOperation,
  configSecretsOperation,
  configSecretsRemoveOperation,
} from "./secrets.js"
import {
  testRerunOperation,
  testRunOperation,
  testStartOperation,
  testStatusOperation,
  testTopicOperation,
} from "./test-session.js"
import { updateOperation } from "./update.js"
import { installOperation } from "./install.js"
import { compileOperation, runOperation, validateOperation } from "./workflow.js"

/** Host operations compiled into the CLI `COMMANDS` map. @category CLI */
export const operations: OperationDefinition[] = [
  runOperation,
  validateOperation,
  compileOperation,
  installOperation,
  describeOperation,
  searchOperation,
  invokeOperation,
  testTopicOperation,
  testStartOperation,
  testRunOperation,
  testRerunOperation,
  testStatusOperation,
  initOperation,
  configSecretsOperation,
  configSecretsAddOperation,
  configSecretsGetOperation,
  configSecretsListOperation,
  configSecretsRemoveOperation,
  pluginsNewOperation,
  pluginsBuildOperation,
  pluginsCheckOperation,
  discoverOperation,
  updateOperation,
  rollbackOperation,
]
