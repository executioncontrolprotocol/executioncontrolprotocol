import { LATEST_ECP_VERSION } from "@executioncontrolprotocol/types"
import type {
  PendingMutation,
  RunResult,
  RunStatus,
  StepNode,
  StepRunRecord,
  WorkflowManifest,
  WorkflowNode,
} from "@executioncontrolprotocol/types"
import type { RuntimeExecutor, RuntimeExecutionContext } from "./executor.js"
import {
  createConsoleLogger,
  createUsageLedger,
  type CapabilityContext,
  type PolicyContext,
} from "./context.js"
import { emitLifecycle } from "./lifecycle.js"
import { pendingToMutationRecords } from "./mutation-records.js"
import { evaluatePolicies } from "./policy-engine.js"
import { resolveStepInput } from "./resolve-input.js"
import {
  collectStateHandles,
  createMutationBuffer,
  createTransactionalStore,
  type MutationBuffer,
} from "./store.js"
import { commitTransaction } from "./commit.js"
import { isLastTestStep } from "./test-session-state.js"
import { applyWorkflowReturns } from "../schema/workflow-io.js"
import {
  CapabilityDispatchError,
  createDispatchingCall,
  dispatchCapability,
} from "./dispatch-capability.js"

function newRunId(): string {
  return globalThis.crypto.randomUUID()
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Run aborted", "AbortError")
  }
}

function evalExpr(
  expr: import("@executioncontrolprotocol/types").ExprValue | undefined,
  state: Record<string, unknown>
): boolean {
  if (!expr) return true
  if ("eq" in expr && Array.isArray(expr.eq)) {
    const [path, expected] = expr.eq
    const parts = String(path).split(".")
    let cur: unknown = state
    for (const p of parts) {
      if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[p]
    }
    return cur === expected
  }
  return true
}

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  maxConcurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let index = 0
  const workers = Array.from({ length: Math.min(maxConcurrency, tasks.length) }, async () => {
    while (index < tasks.length) {
      const i = index++
      results[i] = await tasks[i]!()
    }
  })
  await Promise.all(workers)
  return results
}

type StepRunCtx = {
  manifest: WorkflowManifest
  runId: string
  state: Record<string, unknown>
  history: Record<string, StepRunRecord>
  usage: ReturnType<typeof createUsageLedger>
  logger: ReturnType<typeof createConsoleLogger>
  context: RuntimeExecutionContext
  extensionHooks: import("../definitions/types.js").HookDefinition[]
  signal?: AbortSignal
  maxConcurrency: number
  /** Set when inclusive stopAfterStepId completes. */
  stoppedAfter: boolean
}

/** Platform-neutral in-memory workflow executor. @category Runtime */
export class InMemoryRuntimeExecutor implements RuntimeExecutor {
  async execute(
    manifest: WorkflowManifest,
    context: RuntimeExecutionContext
  ): Promise<RunResult> {
    const runId = context.runId || newRunId()
    const signal = context.signal
    const maxConcurrency =
      context.maxConcurrency ??
      (context.bindings.runtime.config.maxConcurrency as number | undefined) ??
      4
    const mode = context.mode ?? "run"

    const state: Record<string, unknown> = context.seedState
      ? { ...context.seedState }
      : { ...context.input }
    const history: Record<string, StepRunRecord> = context.seedHistory
      ? { ...context.seedHistory }
      : {}
    const usage = createUsageLedger()
    const logger = createConsoleLogger()
    const extensionHooks = context.bindings.extensionHooks

    const runBase = {
      workflow: manifest,
      run: { id: runId, input: context.input },
      state,
    }

    await emitLifecycle("run:before", extensionHooks, {
      event: "run:before",
      ...runBase,
    })
    await emitLifecycle("run:started", extensionHooks, {
      event: "run:started",
      ...runBase,
    })

    const stepCtx: StepRunCtx = {
      manifest,
      runId,
      state,
      history,
      usage,
      logger,
      context,
      extensionHooks,
      signal,
      maxConcurrency,
      stoppedAfter: false,
    }

    try {
      throwIfAborted(signal)
      await this.runNodes(manifest.steps, stepCtx)

      let status: RunStatus = "completed"
      if (mode === "test" && stepCtx.stoppedAfter) {
        const stopId = context.stopAfterStepId
        status =
          stopId && isLastTestStep(manifest, stopId) ? "completed" : "paused"
      } else if (mode === "test" && context.onlyStepId) {
        status = isLastTestStep(manifest, context.onlyStepId) ? "completed" : "paused"
      }

      const stepStatuses = Object.values(history).map((h) => h.status)
      if (stepStatuses.includes("failed")) status = "failed"
      else if (stepStatuses.includes("cancelled")) status = "cancelled"
      else if (status === "completed" && stepStatuses.includes("paused")) status = "paused"

      if (status === "completed") {
        await emitLifecycle("run:completed", extensionHooks, {
          event: "run:completed",
          ...runBase,
          state,
        })
      } else if (status === "failed") {
        await emitLifecycle("run:failed", extensionHooks, {
          event: "run:failed",
          ...runBase,
          state,
        })
      }

      return applyWorkflowReturns(
        manifest,
        {
          schema: "@executioncontrolprotocol.run.result",
          version: LATEST_ECP_VERSION,
          run: { id: runId, status },
          state,
          history,
          usage: { ...usage },
        },
        state
      )
    } catch (err) {
      if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) {
        await emitLifecycle("run:cancelled", extensionHooks, {
          event: "run:cancelled",
          ...runBase,
          state,
        })
        return {
          schema: "@executioncontrolprotocol.run.result",
          version: LATEST_ECP_VERSION,
          run: { id: runId, status: "cancelled" },
          state,
          history,
          usage: { ...usage },
        }
      }
      await emitLifecycle("run:failed", extensionHooks, {
        event: "run:failed",
        ...runBase,
        state,
      })
      return {
        schema: "@executioncontrolprotocol.run.result",
        version: LATEST_ECP_VERSION,
        run: { id: runId, status: "failed" },
        state,
        history,
        usage: { ...usage },
      }
    } finally {
      await emitLifecycle("run:finally", extensionHooks, {
        event: "run:finally",
        ...runBase,
        state,
      })
    }
  }

  private async runNodes(nodes: WorkflowNode[], ctx: StepRunCtx): Promise<void> {
    for (const node of nodes) {
      if (ctx.stoppedAfter) return
      throwIfAborted(ctx.signal)
      await this.runNode(node, ctx)
    }
  }

  private async runNode(node: WorkflowNode, ctx: StepRunCtx): Promise<void> {
    if (ctx.stoppedAfter) return

    if (node.type === "parallel") {
      const tasks = node.branches.map(
        (branch) => () => this.runNodes(branch, ctx)
      )
      await runWithConcurrency(tasks, ctx.maxConcurrency)
      return
    }
    if (node.type === "branch") {
      for (const b of node.branches) {
        if (evalExpr(b.when, ctx.state)) {
          await this.runNodes(b.steps, ctx)
          break
        }
      }
      return
    }
    if (node.type === "loop") {
      let rounds = 0
      while (!node.until || !evalExpr(node.until, ctx.state)) {
        if (ctx.stoppedAfter) return
        throwIfAborted(ctx.signal)
        if (node.maxRounds !== undefined && rounds >= node.maxRounds) break
        await this.runNodes(node.steps, ctx)
        rounds++
        if (node.until && evalExpr(node.until, ctx.state)) break
      }
      return
    }

    const step = node as StepNode
    if (step.when && !evalExpr(step.when, ctx.state)) return

    const mode = ctx.context.mode ?? "run"
    const onlyStepId = ctx.context.onlyStepId

    if (mode === "test" && onlyStepId && step.id !== onlyStepId) {
      return
    }

    if (
      mode === "test" &&
      !onlyStepId &&
      ctx.history[step.id]?.status === "completed"
    ) {
      if (ctx.context.stopAfterStepId === step.id) {
        ctx.stoppedAfter = true
      }
      return
    }

    await this.executeStep(step, ctx)

    if (mode === "test" && ctx.context.stopAfterStepId === step.id) {
      ctx.stoppedAfter = true
    }
  }

  private async executeStep(step: StepNode, ctx: StepRunCtx): Promise<void> {
    throwIfAborted(ctx.signal)

    const cap = ctx.context.registry.getCapability(step.uses)
    if (!cap) {
      throw new Error(`Unknown capability: ${step.uses}`)
    }

    const stepCtx = {
      id: step.id,
      capabilityId: step.uses,
      label: step.label,
    }

    const stepRecord: StepRunRecord = { status: "failed" }
    let output: unknown
    let buffer: (MutationBuffer & { push(m: PendingMutation): void }) | undefined
    let policyCtxBase: Omit<
      PolicyContext,
      "output" | "pendingMutations" | "proposedState"
    >

    const lifecycleBase = {
      workflow: ctx.manifest,
      run: { id: ctx.runId, input: ctx.context.input },
      step: stepCtx,
      state: ctx.state,
    }

    const runStepFinally = async (): Promise<void> => {
      await emitLifecycle("step:finally", ctx.extensionHooks, {
        event: "step:finally",
        ...lifecycleBase,
      })
      if (policyCtxBase!) {
        await evaluatePolicies(
          "policy:finally",
          ctx.context.bindings.policyHooks,
          {
            ...policyCtxBase,
            output,
          } as PolicyContext
        )
      }
    }

    try {
      await emitLifecycle("step:before", ctx.extensionHooks, {
        event: "step:before",
        ...lifecycleBase,
      })

      const resolvedInput = resolveStepInput(step.input, ctx.state)
      const mutableHandles = collectStateHandles(resolvedInput)
      const stateBeforeMutations = structuredClone(ctx.state)

      policyCtxBase = {
        workflow: ctx.manifest,
        run: { id: ctx.runId, input: ctx.context.input },
        step: stepCtx,
        state: ctx.state,
        input: resolvedInput,
        mutableStateHandles: [...mutableHandles].map((p) => ({
          path: p,
          __brand: undefined,
        })),
        usage: ctx.usage,
      }

      const preDecision = await evaluatePolicies(
        "policy:pre",
        ctx.context.bindings.policyHooks,
        policyCtxBase as PolicyContext
      )

      if (preDecision.type === "deny") {
        stepRecord.status = "failed"
        return
      }
      if (preDecision.type === "pause") {
        stepRecord.status = "paused"
        return
      }

      throwIfAborted(ctx.signal)

      buffer = createMutationBuffer(ctx.state, mutableHandles)
      const store = createTransactionalStore({
        state: ctx.state,
        buffer,
        allowedHandles: mutableHandles,
      })

      const extId = step.uses.replace(/\.[^.]+$/, "")
      const extBinding = ctx.context.bindings.extensions.find((e) => e.id === extId)
      const capCtx: CapabilityContext & {
        extensionConfig?: Record<string, unknown>
      } = {
        store,
        state: ctx.state,
        run: { id: ctx.runId, input: ctx.context.input },
        step: stepCtx,
        logger: ctx.logger,
        usage: ctx.usage,
        extensionConfig: extBinding?.config,
        blobs: ctx.context.blobs,
        capabilities: {
          call: async (id) => {
            throw new Error(`nested call not bound: ${id}`)
          },
        },
      }
      const dispatchOpts = {
        ctx: capCtx,
        registry: ctx.context.registry,
        runtimeId: String(ctx.context.bindings.runtime.id),
        remoteInvoke: ctx.context.remoteInvoke,
      }
      capCtx.capabilities.call = createDispatchingCall(dispatchOpts)

      await emitLifecycle("step:started", ctx.extensionHooks, {
        event: "step:started",
        ...lifecycleBase,
      })

      try {
        output = await dispatchCapability({
          ...dispatchOpts,
          capabilityId: step.uses,
          input: resolvedInput,
        })
      } catch (err) {
        buffer.discard()
        await emitLifecycle("step:failed", ctx.extensionHooks, {
          event: "step:failed",
          ...lifecycleBase,
        })
        stepRecord.status = "failed"
        if (err instanceof CapabilityDispatchError) {
          stepRecord.diagnostics = err.result.diagnostics
        } else {
          const message = err instanceof Error ? err.message : String(err)
          stepRecord.diagnostics = [{ severity: "error", code: "STEP_FAILED", message }]
        }
        return
      }

      throwIfAborted(ctx.signal)

      const proposedState = buffer.preview(ctx.state)
      const postDecision = await evaluatePolicies(
        "policy:post",
        ctx.context.bindings.policyHooks,
        {
          ...policyCtxBase,
          output,
          pendingMutations: buffer.pending(),
          proposedState,
        } as PolicyContext
      )

      if (postDecision.type === "deny" || postDecision.type === "pause") {
        buffer.discard()
        stepRecord.status = postDecision.type === "pause" ? "paused" : "failed"
        stepRecord.output = output
        return
      }

      if (ctx.signal?.aborted) {
        buffer.discard()
        await emitLifecycle("step:cancelled", ctx.extensionHooks, {
          event: "step:cancelled",
          ...lifecycleBase,
        })
        stepRecord.status = "cancelled"
        throw new DOMException("Step aborted", "AbortError")
      }

      const pending = buffer.pending()
      let commitMode = step.mode
      if (
        (ctx.context.mode ?? "run") === "test" &&
        step.as !== undefined &&
        (commitMode === undefined || commitMode === "create") &&
        ctx.state[step.as] !== undefined
      ) {
        commitMode = "replace"
      }

      commitTransaction({
        state: ctx.state,
        mutations: pending,
        output,
        as: step.as,
        mode: commitMode,
      })

      stepRecord.status = "completed"
      stepRecord.output = output
      stepRecord.committedAs = step.as ?? null
      stepRecord.mutations = pendingToMutationRecords(
        pending,
        step.id,
        step.uses,
        stateBeforeMutations
      )

      await emitLifecycle("step:completed", ctx.extensionHooks, {
        event: "step:completed",
        ...lifecycleBase,
        output,
      })
    } finally {
      ctx.history[step.id] = stepRecord
      if (policyCtxBase!) {
        await runStepFinally()
      }
    }
  }
}
