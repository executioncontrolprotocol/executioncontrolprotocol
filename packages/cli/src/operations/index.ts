import type { OperationDefinition } from "@executioncontrolprotocol/plugin-sdk"
import { describeOperation, invokeOperation, searchOperation } from "./catalog.js"
import { discoverOperation } from "./discover.js"
import {
  environmentsEditOperation,
  environmentsExportOperation,
  environmentsInitOperation,
  environmentsTopicOperation,
} from "./environments.js"
import { initOperation } from "./init.js"
import {
  pluginsBuildOperation,
  pluginsCheckOperation,
  pluginsNewOperation,
} from "./plugins.js"
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
import { installOperation } from "./install.js"
import {
  compileOperation,
  runOperation,
  validateOperation,
  workflowsTopicOperation,
} from "./workflow.js"

/** Host operations compiled into the CLI `COMMANDS` map. @category CLI */
export const operations: OperationDefinition[] = [
  workflowsTopicOperation,
  runOperation,
  initOperation,
  validateOperation,
  compileOperation,
  installOperation,
  environmentsTopicOperation,
  describeOperation,
  searchOperation,
  invokeOperation,
  environmentsExportOperation,
  environmentsInitOperation,
  environmentsEditOperation,
  runsTopicOperation,
  runsListOperation,
  runsShowOperation,
  runsResumeOperation,
  runsRerunOperation,
  configSecretsOperation,
  configSecretsAddOperation,
  configSecretsGetOperation,
  configSecretsListOperation,
  configSecretsRemoveOperation,
  pluginsNewOperation,
  pluginsBuildOperation,
  pluginsCheckOperation,
  discoverOperation,
]
