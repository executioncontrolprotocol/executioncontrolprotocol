import { Command } from "@oclif/core"
import { ECP_INPUT_INVALID, EXIT_FAILED, EXIT_USAGE } from "./codes.js"
import { EcpCliError } from "./errors.js"
import { failureEnvelope, type EcpErrorBody } from "./envelope.js"

/**
 * Base class for generated capability and operation commands.
 * Owns the JSON envelope, error codes and exit codes.
 * @category CLI
 */
export abstract class EcpCommand extends Command {
  static enableJsonFlag = true

  /**
   * True when the caller passed `--json`. Non-TTY spawn clients keep pretty JSON
   * until they opt in with `--json` (existing CLI tests).
   * @category CLI
   */
  protected wantsEnvelope(): boolean {
    return this.jsonEnabled()
  }

  /**
   * Pretty-print `data` when not using `--json`. With `--json`, oclif prints
   * {@link toSuccessJson} from the `run()` return value.
   * @category CLI
   */
  protected writeSuccess(data: unknown): void {
    if (this.jsonEnabled()) return
    if (data === undefined) return
    if (typeof data === "string") {
      this.log(data)
      return
    }
    this.log(JSON.stringify(data, null, 2))
  }

  /**
   * oclif `--json` success wrapper. Returns the ECP envelope, not the raw result.
   * @category CLI
   */
  toSuccessJson(result: unknown): unknown {
    return { ok: true, data: result }
  }

  /**
   * oclif `--json` error wrapper. Keeps the `ECP_*` code instead of oclif's
   * `{ error: { oclif: { exit } } }` payload.
   * @category CLI
   */
  toErrorJson(error: unknown): unknown {
    return failureEnvelope(errorBody(error))
  }

  /**
   * Print the ECP error envelope (or pretty message) and exit.
   * @category CLI
   */
  async catch(error: Error & { exitCode?: number }): Promise<void> {
    const body = errorBody(error)
    const exitCode = exitCodeOf(error)
    if (this.jsonEnabled()) {
      this.log(JSON.stringify(failureEnvelope(body)))
      this.exit(exitCode)
    }
    this.error(body.message, { exit: exitCode })
  }
}

function errorBody(error: unknown): EcpErrorBody {
  if (error instanceof EcpCliError) return error.toBody()
  if (error && typeof error === "object" && "oclif" in error) {
    const err = error as Error & { oclif?: { exit?: number } }
    const exit = err.oclif?.exit
    return {
      code: exit === EXIT_USAGE ? ECP_INPUT_INVALID : "ECP_CLI_ERROR",
      message: err.message,
    }
  }
  if (error instanceof Error) {
    return { code: "ECP_CLI_ERROR", message: error.message }
  }
  return { code: "ECP_CLI_ERROR", message: String(error) }
}

function exitCodeOf(error: unknown): number {
  if (error instanceof EcpCliError) return error.exitCode
  if (error && typeof error === "object" && "oclif" in error) {
    const exit = (error as { oclif?: { exit?: number } }).oclif?.exit
    if (typeof exit === "number") return exit
  }
  if (error && typeof error === "object" && "exitCode" in error) {
    const exit = (error as { exitCode?: number }).exitCode
    if (typeof exit === "number") return exit
  }
  return EXIT_FAILED
}
