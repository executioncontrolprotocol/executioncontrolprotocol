import {
  ECP_CAPABILITY_UNKNOWN,
  ECP_POLICY_DENIED,
  ECP_RUN_PAUSED,
  ECP_STEP_FAILED,
  EcpError,
  LATEST_ECP_VERSION,
  publicRunEvent,
} from "../types/index.js"
import type {
  PendingMutation,
  PolicyJournalDecision,
  RunResult,
  RunStatus,
  StepNode,
  StepRunRecord,
  WorkflowManifest,
  WorkflowNode,
} from "../types/index.js"
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
import { findStep, isLastStep } from "./step-order.js"
import { detailsFromThrown } from "./error-details.js"
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

function firstUnresolvedStep(
  manifest: WorkflowManifest,
  history: Record<string, StepRunRecord>
): { id: string; capabilityId: string; record: StepRunRecord } | undefined {
  const match = Object.entries(history).find(
    ([, record]) => record.status === "failed" || record.status === "paused"
  )
  if (!match) return undefined
  const [id, record] = match
  const node = findStep(manifest, id)
  return { id, capabilityId: node?.uses ?? "", record }
}

function evalExpr(
  expr: import("../types/index.js").ExprValue | undefined,
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
      journal: context.journal,
      approvals: context.approvals,
    }

    await emitLifecycle("run:before", extensionHooks, {
      event: "run:before",
      ...runBase,
    })
    await emitLifecycle("run:started", extensionHooks, {
      event: "run:started",
      ...runBase,
    })
    await context.onEvent?.(publicRunEvent("run.start", runId, { status: "started" }))

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

    let status: RunStatus = "failed"
    try {
      throwIfAborted(signal)
      await this.runNodes(manifest.steps, stepCtx)

      status = "completed"
      if (stepCtx.stoppedAfter) {
        const stopId = context.stopAfterStepId
        status = stopId && isLastStep(manifest, stopId) ? "completed" : "stopped"
      } else if (context.onlyStepId) {
        status = isLastStep(manifest, context.onlyStepId) ? "completed" : "stopped"
      }

      const stepStatuses = Object.values(history).map((h) => h.status)
      if (stepStatuses.includes("failed")) status = "failed"
      else if (stepStatuses.includes("cancelled")) status = "cancelled"
      else if (stepStatuses.includes("paused")) status = "paused"

      const unresolved = firstUnresolvedStep(manifest, history)
      const unresolvedCtx = unresolved
        ? {
            step: { id: unresolved.id, capabilityId: unresolved.capabilityId },
            diagnostics: unresolved.record.diagnostics,
            output: unresolved.record.output,
          }
        : {}

      if (status === "completed") {
        await emitLifecycle("run:completed", extensionHooks, {
          event: "run:completed",
          ...runBase,
          state,
          status,
        })
      } else if (status === "failed") {
        await emitLifecycle("run:failed", extensionHooks, {
          event: "run:failed",
          ...runBase,
          state,
          status,
          ...unresolvedCtx,
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
        status = "cancelled"
        await emitLifecycle("run:cancelled", extensionHooks, {
          event: "run:cancelled",
          ...runBase,
          state,
          status,
        })
        return {
          schema: "@executioncontrolprotocol.run.result",
          version: LATEST_ECP_VERSION,
          run: { id: runId, status },
          state,
          history,
          usage: { ...usage },
        }
      }
      status = "failed"
      const unresolved = firstUnresolvedStep(manifest, history)
      await emitLifecycle("run:failed", extensionHooks, {
        event: "run:failed",
        ...runBase,
        state,
        status,
        ...(unresolved
          ? {
              step: { id: unresolved.id, capabilityId: unresolved.capabilityId },
              diagnostics: unresolved.record.diagnostics,
              output: unresolved.record.output,
            }
          : {}),
      })
      return {
        schema: "@executioncontrolprotocol.run.result",
        version: LATEST_ECP_VERSION,
        run: { id: runId, status },
        state,
        history,
        usage: { ...usage },
      }
    } finally {
      const unresolved = firstUnresolvedStep(manifest, history)
      await emitLifecycle("run:finally", extensionHooks, {
        event: "run:finally",
        ...runBase,
        state,
        status,
        ...(unresolved
          ? {
              step: { id: unresolved.id, capabilityId: unresolved.capabilityId },
              diagnostics: unresolved.record.diagnostics,
              output: unresolved.record.output,
            }
          : {}),
      })
      await context.onEvent?.(publicRunEvent("run.end", runId, { status }))
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

    const onlyStepId = ctx.context.onlyStepId

    if (onlyStepId && step.id !== onlyStepId) {
      return
    }

    if (!onlyStepId && ctx.history[step.id]?.status === "completed") {
      if (ctx.context.stopAfterStepId === step.id) {
        ctx.stoppedAfter = true
      }
      return
    }

    await this.executeStep(step, ctx)

    if (ctx.context.stopAfterStepId === step.id) {
      ctx.stoppedAfter = true
    }
  }

  private async executeStep(step: StepNode, ctx: StepRunCtx): Promise<void> {
    throwIfAborted(ctx.signal)

    const cap = ctx.context.registry.getCapability(step.uses)
    if (!cap) {
      const diagnostics = [
        {
          severity: "error" as const,
          code: ECP_CAPABILITY_UNKNOWN,
          message: `Unknown capability: ${step.uses}`,
          path: `steps.${step.id}.uses`,
        },
      ]
      ctx.history[step.id] = { status: "failed", diagnostics }
      await emitLifecycle("step:failed", ctx.extensionHooks, {
        event: "step:failed",
        workflow: ctx.manifest,
        run: { id: ctx.runId, input: ctx.context.input },
        step: { id: step.id, capabilityId: step.uses, label: step.label },
        state: ctx.state,
        diagnostics,
        journal: ctx.context.journal,
      })
      ctx.context.onEvent?.(
        publicRunEvent("step.error", ctx.runId, {
          stepId: step.id,
          status: "failed",
          error: { code: ECP_CAPABILITY_UNKNOWN, message: diagnostics[0]!.message },
        })
      )
      return
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

    const policyDetails: PolicyJournalDecision[] = []
    const startedAt = Date.now()

    const lifecycleBase = {
      workflow: ctx.manifest,
      run: { id: ctx.runId, input: ctx.context.input },
      step: stepCtx,
      state: ctx.state,
      journal: ctx.context.journal,
      approvals: ctx.context.approvals,
      policyDecisions: policyDetails,
    }

    const emitStepError = (diagnostics?: StepRunRecord["diagnostics"]): void => {
      const first = diagnostics?.[0]
      ctx.context.onEvent?.(
        publicRunEvent("step.error", ctx.runId, {
          stepId: step.id,
          status: "failed",
          durationMs: Date.now() - startedAt,
          error: first
            ? { code: first.code, message: first.message }
            : { message: "step failed" },
        })
      )
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

      let resolvedInput: Record<string, unknown>
      try {
        resolvedInput = resolveStepInput(step.input, ctx.state)
      } catch (err) {
        if (err instanceof EcpError) {
          stepRecord.status = "failed"
          stepRecord.diagnostics = [
            {
              severity: "error",
              code: err.code,
              message: err.message,
              ...(err.path ? { path: err.path } : {}),
              ...(err.suggestions ? { suggestions: err.suggestions } : {}),
            },
          ]
          await emitLifecycle("step:failed", ctx.extensionHooks, {
            event: "step:failed",
            ...lifecycleBase,
            diagnostics: stepRecord.diagnostics,
          })
          emitStepError(stepRecord.diagnostics)
          return
        }
        throw err
      }
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
        approvals: ctx.context.approvals,
      }

      const preDecision = await evaluatePolicies(
        "policy:pre",
        ctx.context.bindings.policyHooks,
        policyCtxBase as PolicyContext,
        policyDetails
      )
      for (const detail of policyDetails.filter((d) => d.event === "policy:pre")) {
        ctx.context.onEvent?.(
          publicRunEvent("step.policy", ctx.runId, { stepId: step.id, policy: detail })
        )
      }

      if (preDecision.type === "deny") {
        stepRecord.status = "failed"
        stepRecord.diagnostics = [
          {
            severity: "error",
            code: preDecision.code ?? ECP_POLICY_DENIED,
            message: preDecision.reason,
          },
        ]
        await emitLifecycle("step:failed", ctx.extensionHooks, {
          event: "step:failed",
          ...lifecycleBase,
          diagnostics: stepRecord.diagnostics,
        })
        emitStepError(stepRecord.diagnostics)
        return
      }
      if (preDecision.type === "pause") {
        stepRecord.status = "paused"
        stepRecord.diagnostics = [
          {
            severity: "error",
            code: ECP_RUN_PAUSED,
            message: preDecision.reason,
          },
        ]
        await emitLifecycle("step:paused", ctx.extensionHooks, {
          event: "step:paused",
          ...lifecycleBase,
          resolvedInput,
          diagnostics: stepRecord.diagnostics,
        })
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
        artifacts: ctx.context.artifacts,
        services: ctx.context.services,
        remoteInvoke: ctx.context.remoteInvoke,
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
        resolvedInput,
      })
      ctx.context.onEvent?.(
        publicRunEvent("step.start", ctx.runId, { stepId: step.id, status: "started" })
      )

      try {
        output = await dispatchCapability({
          ...dispatchOpts,
          capabilityId: step.uses,
          input: resolvedInput,
        })
      } catch (err) {
        buffer.discard()
        stepRecord.status = "failed"
        if (err instanceof CapabilityDispatchError) {
          stepRecord.diagnostics = err.result.diagnostics
          if (err.result.result !== undefined) stepRecord.output = err.result.result
        } else {
          const message = err instanceof Error ? err.message : String(err)
          const fields = detailsFromThrown(err)
          stepRecord.diagnostics = [
            {
              severity: "error",
              code: ECP_STEP_FAILED,
              message,
              ...(fields.details ? { details: fields.details } : {}),
            },
          ]
          if (fields.output !== undefined) stepRecord.output = fields.output
        }
        await emitLifecycle("step:failed", ctx.extensionHooks, {
          event: "step:failed",
          ...lifecycleBase,
          diagnostics: stepRecord.diagnostics,
          output: stepRecord.output,
        })
        emitStepError(stepRecord.diagnostics)
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
        } as PolicyContext,
        policyDetails
      )
      for (const detail of policyDetails.filter((d) => d.event === "policy:post")) {
        ctx.context.onEvent?.(
          publicRunEvent("step.policy", ctx.runId, { stepId: step.id, policy: detail })
        )
      }

      if (postDecision.type === "deny" || postDecision.type === "pause") {
        buffer.discard()
        stepRecord.status = postDecision.type === "pause" ? "paused" : "failed"
        stepRecord.output = output
        if (postDecision.type === "deny") {
          stepRecord.diagnostics = [
            {
              severity: "error",
              code: postDecision.code ?? ECP_POLICY_DENIED,
              message: postDecision.reason,
            },
          ]
          await emitLifecycle("step:failed", ctx.extensionHooks, {
            event: "step:failed",
            ...lifecycleBase,
            diagnostics: stepRecord.diagnostics,
            output: stepRecord.output,
          })
          emitStepError(stepRecord.diagnostics)
        } else {
          stepRecord.diagnostics = [
            {
              severity: "error",
              code: ECP_RUN_PAUSED,
              message: postDecision.reason,
            },
          ]
          await emitLifecycle("step:paused", ctx.extensionHooks, {
            event: "step:paused",
            ...lifecycleBase,
            diagnostics: stepRecord.diagnostics,
            output: stepRecord.output,
          })
        }
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
      stepRecord.attempts = 1
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
        resolvedInput,
        pendingMutations: pending,
      })
      ctx.context.onEvent?.(
        publicRunEvent("step.end", ctx.runId, {
          stepId: step.id,
          status: "completed",
          durationMs: Date.now() - startedAt,
        })
      )
    } finally {
      ctx.history[step.id] = stepRecord
      if (policyCtxBase!) {
        await runStepFinally()
      }
    }
  }
}
