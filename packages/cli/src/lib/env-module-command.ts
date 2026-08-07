import { Args, Command, Flags } from "@oclif/core"
import { loadEnvironmentModule } from "@executioncontrolprotocol/core/loaders"
import type { Ecp } from "@executioncontrolprotocol/core"

/** Shared `--env` flag for commands that load an environment module. */
export const envModuleFlags = {
  env: Flags.string({
    required: true,
    description: "Path to environment module (.ts or .js)",
  }),
}

/**
 * Base for commands that require an environment module (`--env`).
 * @category CLI
 */
export abstract class EnvModuleCommand extends Command {
  static flags = {
    ...Command.baseFlags,
    ...envModuleFlags,
  }

  /** ECP instances initialized during this command, terminated in `finally`. */
  private initializedEcps: Ecp[] = []

  /** Load and initialize operational ECP from parsed flags. */
  protected async loadEcp(flags: { env: string }): Promise<Ecp> {
    const env = await loadEnvironmentModule(flags.env)
    const ecp = await env.init()
    this.initializedEcps.push(ecp)
    return ecp
  }

  /**
   * Terminate any initialized environments so `environment:terminate` hooks
   * (telemetry flush, connection cleanup) run even on failure. Cleanup errors
   * are swallowed so they never mask the command's own exit code.
   */
  async finally(error: Error | undefined): Promise<unknown> {
    const ecps = this.initializedEcps
    this.initializedEcps = []
    for (const ecp of ecps) {
      try {
        await ecp.terminate()
      } catch {
        /* ignore cleanup errors */
      }
    }
    return super.finally(error)
  }
}

/**
 * Base for commands that take a workflow path and `--env`.
 * @category CLI
 */
export abstract class WorkflowEnvCommand extends EnvModuleCommand {
  static args = {
    "workflow-path": Args.string({
      required: true,
      description: "Workflow file (.ts, .js, or .json)",
    }),
  }
}
