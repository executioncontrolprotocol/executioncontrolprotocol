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
  runsListOperation,
  runsRerunOperation,
  runsResumeOperation,
  runsShowOperation,
  runsTopicOperation,
} from "./runs.js"
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
  runsTopicOperation,
  runsListOperation,
  runsShowOperation,
  runsResumeOperation,
  runsRerunOperation,
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
