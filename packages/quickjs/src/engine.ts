import type { ExpressionEngine, HostSettings } from "@executioncontrolprotocol/protocol"
import {
  TRANSFORM_BUDGET_MS,
  TRANSFORM_MAX_RESULT_BYTES,
  TRANSFORM_MEMORY_BYTES,
} from "@executioncontrolprotocol/protocol"
import {
  getQuickJS,
  shouldInterruptAfterDeadline,
  type QuickJSContext,
  type QuickJSRuntime,
  type QuickJSWASMModule,
} from "quickjs-emscripten"

/**
 * Failure from transform script evaluation. `code` is an `ECP_SCRIPT_*` catalogue code.
 * @category Environment
 */
export class ScriptEvaluationError extends Error {
  /** Catalogue code. */
  readonly code: "ECP_SCRIPT_FAILED" | "ECP_SCRIPT_TIMEOUT" | "ECP_OUTPUT_INVALID"

  /**
   * @param code Which script failure this is.
   * @param message The QuickJS message, or a limit description.
   */
  constructor(code: ScriptEvaluationError["code"], message: string) {
    super(message)
    this.name = "ScriptEvaluationError"
    this.code = code
  }
}

/**
 * Failure from {@link QuickJsExpressionEngine.evaluateExpression}. `code` is an `ECP_EXPR_*` catalogue code.
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

/** Limits for one transform script evaluation. @category Environment */
export interface TransformLimits {
  /** Interrupt deadline in milliseconds. */
  readonly timeoutMs: number
  /** Runtime memory cap in bytes. */
  readonly memoryBytes: number
  /** Maximum JSON length of a value result. */
  readonly maxResultBytes: number
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

const DEFAULT_TRANSFORM_LIMITS: TransformLimits = {
  timeoutMs: TRANSFORM_BUDGET_MS,
  memoryBytes: TRANSFORM_MEMORY_BYTES,
  maxResultBytes: TRANSFORM_MAX_RESULT_BYTES,
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
  /** Per-registration transform limits, used by tests. */
  transformOptions?: Partial<TransformLimits>
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
  private readonly transformLimits: TransformLimits

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
    const fromTransform = ctx?.settings?.transform
    this.transformLimits = {
      timeoutMs: ctx?.transformOptions?.timeoutMs ?? fromTransform?.timeoutMs ?? DEFAULT_TRANSFORM_LIMITS.timeoutMs,
      memoryBytes:
        ctx?.transformOptions?.memoryBytes ?? fromTransform?.memoryBytes ?? DEFAULT_TRANSFORM_LIMITS.memoryBytes,
      maxResultBytes:
        ctx?.transformOptions?.maxResultBytes ?? fromTransform?.maxResultBytes ?? DEFAULT_TRANSFORM_LIMITS.maxResultBytes,
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
   * Evaluate one expression over a frozen `input` object.
   * Throws {@link ExpressionEvaluationError}.
   */
  async evaluateExpression(source: string, input: unknown): Promise<unknown> {
    if (!this.module) await this.start()
    const module = this.module
    if (!module) throw new ExpressionEvaluationError("ECP_EXPR_FAILED", "QuickJS runtime is not available.")
    const runtime = module.newRuntime()
    runtime.setMemoryLimit(this.limits.memoryBytes)
    const context = runtime.newContext()
    runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + this.limits.timeoutMs))
    try {
      const inputJson = JSON.stringify(input === undefined ? null : input)
      const setup = context.evalCode(
        `${FREEZE_HELPER}\nglobalThis.__ecpInput = __ecpFreeze(JSON.parse(${JSON.stringify(inputJson)}))`,
      )
      this.assertOk(context, setup)
      const call = context.evalCode(`"use strict"; const input = globalThis.__ecpInput; (${source})`)
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
      let encoded: string
      try {
        encoded = JSON.stringify(value)
      } catch (error) {
        throw new ExpressionEvaluationError(
          "ECP_EXPR_RESULT_INVALID",
          error instanceof Error ? error.message : "Expression result is not JSON.",
        )
      }
      if (encoded.length > this.limits.maxResultBytes) {
        throw new ExpressionEvaluationError("ECP_EXPR_FAILED", "Expression result exceeded the size limit.")
      }
      return value
    } catch (error) {
      if (error instanceof ExpressionEvaluationError) throw error
      throw new ExpressionEvaluationError("ECP_EXPR_FAILED", error instanceof Error ? error.message : String(error))
    } finally {
      runtime.removeInterruptHandler()
      context.dispose()
      runtime.dispose()
    }
  }

  /**
   * Evaluate one transform script body against a frozen input value.
   * Throws {@link ScriptEvaluationError}.
   */
  async evaluateScript(source: string, input: unknown): Promise<unknown> {
    if (!this.module) await this.start()
    const module = this.module
    if (!module) throw new ScriptEvaluationError("ECP_SCRIPT_FAILED", "QuickJS runtime is not available.")
    const runtime = module.newRuntime()
    runtime.setMemoryLimit(this.transformLimits.memoryBytes)
    const context = runtime.newContext()
    runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + this.transformLimits.timeoutMs))
    try {
      const inputJson = JSON.stringify(input === undefined ? null : input)
      const setup = context.evalCode(
        `${FREEZE_HELPER}\nglobalThis.__ecpInput = __ecpFreeze(JSON.parse(${JSON.stringify(inputJson)}))`,
      )
      this.assertScriptOk(context, setup)
      const call = context.evalCode(`"use strict"; (function () { const input = globalThis.__ecpInput; ${source} })()`)
      if (call.error) {
        const message = errorText(context.dump(call.error))
        call.dispose()
        if (/interrupted/i.test(message)) {
          throw new ScriptEvaluationError("ECP_SCRIPT_TIMEOUT", "Script exceeded the time budget.")
        }
        if (/out of memory/i.test(message)) {
          throw new ScriptEvaluationError("ECP_SCRIPT_FAILED", "Script exceeded the memory limit.")
        }
        throw new ScriptEvaluationError("ECP_SCRIPT_FAILED", message)
      }
      const value: unknown = context.dump(call.value)
      call.dispose()
      if (value === undefined) {
        throw new ScriptEvaluationError("ECP_OUTPUT_INVALID", "Script must return a JSON value.")
      }
      let encoded: string
      try {
        encoded = JSON.stringify(value)
      } catch (error) {
        throw new ScriptEvaluationError(
          "ECP_OUTPUT_INVALID",
          error instanceof Error ? error.message : "Script result is not JSON.",
        )
      }
      if (encoded.length > this.transformLimits.maxResultBytes) {
        throw new ScriptEvaluationError("ECP_OUTPUT_INVALID", "Script result exceeded the size limit.")
      }
      return value
    } catch (error) {
      if (error instanceof ScriptEvaluationError) throw error
      throw new ScriptEvaluationError("ECP_SCRIPT_FAILED", error instanceof Error ? error.message : String(error))
    } finally {
      runtime.removeInterruptHandler()
      context.dispose()
      runtime.dispose()
    }
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

  private assertScriptOk(context: QuickJSContext, result: ReturnType<QuickJSContext["evalCode"]>): void {
    if (!result.error) {
      result.dispose()
      return
    }
    const message = errorText(context.dump(result.error))
    result.dispose()
    throw new ScriptEvaluationError("ECP_SCRIPT_FAILED", message)
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
