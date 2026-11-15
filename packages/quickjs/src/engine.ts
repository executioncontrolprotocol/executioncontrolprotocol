import type { ExpressionEngine, HostSettings } from "@executioncontrolprotocol/protocol"
import {
  getQuickJS,
  shouldInterruptAfterDeadline,
  type QuickJSContext,
  type QuickJSRuntime,
  type QuickJSWASMModule,
} from "quickjs-emscripten"

/**
 * Failure from {@link QuickJsExpressionEngine}. `code` is an `ECP_EXPR_*` catalogue code.
 * @category Environment
 */
export class ExpressionEvaluationError extends Error {
  /** Catalogue code. */
  readonly code: "ECP_EXPR_FAILED" | "ECP_EXPR_TIMEOUT" | "ECP_EXPR_RESULT_INVALID"

  /**
   * @param code Which expression failure this is.
   * @param message The QuickJS message, or a limit description.
   */
  constructor(code: ExpressionEvaluationError["code"], message: string) {
    super(message)
    this.name = "ExpressionEvaluationError"
    this.code = code
  }
}

/** Limits for one evaluation. @category Environment */
export interface ExpressionLimits {
  /** Interrupt deadline in milliseconds. */
  readonly timeoutMs: number
  /** Runtime memory cap in bytes. */
  readonly memoryBytes: number
  /** Maximum JSON length of a value result. */
  readonly maxResultBytes: number
}

const DEFAULT_LIMITS: ExpressionLimits = {
  timeoutMs: 50,
  memoryBytes: 32 * 1024 * 1024,
  maxResultBytes: 1024 * 1024,
}

const FREEZE_HELPER = `
function __ecpFreeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value)
    for (const key of Object.keys(value)) __ecpFreeze(value[key])
  }
  return value
}
`

/**
 * Context the host passes when it constructs the engine as a service.
 * @category Environment
 */
export interface QuickJsEngineContext {
  /** Host settings. Expression limits override the defaults. */
  settings?: HostSettings
  /** Per-registration overrides, used by tests. */
  options?: Partial<ExpressionLimits>
}

/**
 * One QuickJS runtime for the host. Each evaluation gets a fresh context.
 * The state is copied in as JSON and deep-frozen. The host is not exposed.
 * @category Environment
 */
export class QuickJsExpressionEngine implements ExpressionEngine {
  /** Implementation id. */
  static readonly id = "@executioncontrolprotocol/quickjs"

  private module: QuickJSWASMModule | undefined
  private runtime: QuickJSRuntime | undefined
  private readonly limits: ExpressionLimits

  /**
   * @param ctx Host context. Omitted limits use the MVP defaults (50 ms, 32 MiB, 1 MiB).
   */
  constructor(ctx?: QuickJsEngineContext) {
    const fromSettings = ctx?.settings?.expression
    this.limits = {
      timeoutMs: ctx?.options?.timeoutMs ?? fromSettings?.timeoutMs ?? DEFAULT_LIMITS.timeoutMs,
      memoryBytes: ctx?.options?.memoryBytes ?? fromSettings?.memoryBytes ?? DEFAULT_LIMITS.memoryBytes,
      maxResultBytes: ctx?.options?.maxResultBytes ?? fromSettings?.maxResultBytes ?? DEFAULT_LIMITS.maxResultBytes,
    }
  }

  /** Load the WASM module and create the single runtime. */
  async start(): Promise<void> {
    if (this.runtime) return
    this.module = await getQuickJS()
    this.runtime = this.module.newRuntime()
    this.runtime.setMemoryLimit(this.limits.memoryBytes)
  }

  /** Dispose the runtime. */
  async stop(): Promise<void> {
    this.runtime?.dispose()
    this.runtime = undefined
    this.module = undefined
  }

  /**
   * Evaluate one function source. `control` requires a boolean.
   * Throws {@link ExpressionEvaluationError}.
   */
  async evaluate(source: string, state: unknown, kind: "control" | "value"): Promise<unknown> {
    if (!this.runtime) await this.start()
    const runtime = this.runtime
    if (!runtime) throw new ExpressionEvaluationError("ECP_EXPR_FAILED", "QuickJS runtime is not available.")
    const context = runtime.newContext()
    runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + this.limits.timeoutMs))
    try {
      return this.run(context, source, state, kind)
    } catch (error) {
      if (error instanceof ExpressionEvaluationError) throw error
      throw new ExpressionEvaluationError("ECP_EXPR_FAILED", error instanceof Error ? error.message : String(error))
    } finally {
      runtime.removeInterruptHandler()
      context.dispose()
    }
  }

  private run(context: QuickJSContext, source: string, state: unknown, kind: "control" | "value"): unknown {
    const stateJson = JSON.stringify(state === undefined ? null : state)
    const setup = context.evalCode(
      `${FREEZE_HELPER}\nglobalThis.__ecpState = __ecpFreeze(JSON.parse(${JSON.stringify(stateJson)}))`,
    )
    this.assertOk(context, setup)
    const call = context.evalCode(`(${source})(globalThis.__ecpState)`)
    if (call.error) {
      const message = errorText(context.dump(call.error))
      call.dispose()
      if (/interrupted/i.test(message)) {
        throw new ExpressionEvaluationError("ECP_EXPR_TIMEOUT", "Expression exceeded the time budget.")
      }
      if (/out of memory/i.test(message)) {
        throw new ExpressionEvaluationError("ECP_EXPR_FAILED", "Expression exceeded the memory limit.")
      }
      throw new ExpressionEvaluationError("ECP_EXPR_FAILED", message)
    }
    const value: unknown = context.dump(call.value)
    call.dispose()
    return this.checkResult(value, kind)
  }

  private assertOk(context: QuickJSContext, result: ReturnType<QuickJSContext["evalCode"]>): void {
    if (!result.error) {
      result.dispose()
      return
    }
    const message = errorText(context.dump(result.error))
    result.dispose()
    throw new ExpressionEvaluationError("ECP_EXPR_FAILED", message)
  }

  private checkResult(value: unknown, kind: "control" | "value"): unknown {
    let encoded: string
    try {
      encoded = JSON.stringify(value)
    } catch (error) {
      throw new ExpressionEvaluationError(
        "ECP_EXPR_RESULT_INVALID",
        error instanceof Error ? error.message : "Expression result is not JSON.",
      )
    }
    if (encoded === undefined) {
      throw new ExpressionEvaluationError("ECP_EXPR_RESULT_INVALID", "Expression result is not JSON.")
    }
    if (kind === "value" && encoded.length > this.limits.maxResultBytes) {
      throw new ExpressionEvaluationError("ECP_EXPR_FAILED", "Expression result exceeded the size limit.")
    }
    if (kind === "control" && typeof value !== "boolean") {
      throw new ExpressionEvaluationError("ECP_EXPR_RESULT_INVALID", "A control expression must return a boolean.")
    }
    return value
  }
}

function errorText(dumped: unknown): string {
  if (typeof dumped === "string") return dumped
  if (dumped && typeof dumped === "object" && "message" in dumped) {
    const message = (dumped as { message?: unknown }).message
    if (typeof message === "string" && message.length > 0) return message
  }
  return "Expression failed."
}
