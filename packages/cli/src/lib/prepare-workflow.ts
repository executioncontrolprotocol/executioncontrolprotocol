import type { Interfaces } from "@oclif/core"
import type { Ecp, LoadedWorkflow } from "@executioncontrolprotocol/core"
import {
  ECP_RUN_PAUSED,
  ECP_STEP_FAILED,
  ECP_WORKFLOW_LOAD,
  EcpError,
  type RunResult,
} from "@executioncontrolprotocol/core/types"
import { loadWorkflowFile } from "@executioncontrolprotocol/node"
import {
  EcpCliError,
  EXIT_FAILED,
  EXIT_PAUSED,
  EXIT_USAGE,
  type EcpHost,
} from "@executioncontrolprotocol/plugin-sdk"
import { ensurePluginsInstalled } from "./ensure-plugins.js"
import { layerRunEnvironment } from "./layer-environment.js"

function asCliError(err: unknown): never {
  if (err instanceof EcpCliError) throw err
  if (err instanceof EcpError) {
    throw new EcpCliError(err.code, err.message, {
      path: err.path,
      suggestions: err.suggestions,
      exitCode: err.code === ECP_WORKFLOW_LOAD ? EXIT_USAGE : EXIT_FAILED,
      details: err.details,
    })
  }
  throw err
}

/**
 * Load a workflow file, optionally install missing plugins, and layer the environment.
 * @category CLI
 */
export async function prepareWorkflowRun(options: {
  workflowPath: string
  envFlag?: string
  config: Interfaces.Config
  argv: string[]
  json: boolean
  host?: EcpHost
  install: boolean
}): Promise<{ loaded: LoadedWorkflow; ecp: Ecp; terminate: boolean }> {
  let loaded: LoadedWorkflow
  try {
    loaded = await loadWorkflowFile(options.workflowPath)
  } catch (err) {
    asCliError(err)
  }
  const host = await ensurePluginsInstalled({
    requirements: loaded.requirements,
    config: options.config,
    argv: options.argv,
    json: options.json,
    install: options.install,
    host: options.host,
    envFlag: options.envFlag,
  })
  try {
    const layered = await layerRunEnvironment({
      envFlag: options.envFlag,
      workflowBindings: loaded.builder?.getBindings(),
      config: options.config,
      host: host ?? options.host,
    })
    return { loaded, ...layered }
  } catch (err) {
    asCliError(err)
  }
}

/**
 * Map a non-completed run to a CLI error. `stopped` is success (Phase 4 PR 2).
 * @category CLI
 */
export function throwIfRunFailed(result: RunResult): RunResult {
  const status = result.run.status
  if (status === "completed" || status === "stopped") return result
  if (status === "paused") {
    const diagnostic = Object.values(result.history ?? {})
      .flatMap((step) => step.diagnostics ?? [])
      .find((issue) => issue.code === ECP_RUN_PAUSED) ?? {
      code: ECP_RUN_PAUSED,
      message: `Workflow run paused. Resume with ecp runs resume ${result.run.id}`,
    }
    throw new EcpCliError(diagnostic.code ?? ECP_RUN_PAUSED, diagnostic.message, {
      path: diagnostic.path,
      suggestions: diagnostic.suggestions ?? [`ecp runs resume ${result.run.id}`],
      exitCode: EXIT_PAUSED,
    })
  }
  const diagnostic = Object.values(result.history ?? {}).flatMap(
    (step) => step.diagnostics ?? []
  )[0]
  throw new EcpCliError(
    diagnostic?.code ?? ECP_STEP_FAILED,
    diagnostic?.message ?? `Workflow run did not complete (status: ${status})`,
    { path: diagnostic?.path, suggestions: diagnostic?.suggestions, exitCode: EXIT_FAILED }
  )
}
