import type { Ecp, Environment } from "@executioncontrolprotocol/core"
import { formatRepairLoopTimingReport } from "@executioncontrolprotocol/core"
import type { HarnessCapabilityId, HarnessInvokeResult } from "@executioncontrolprotocol/types"
import {
  EVAL_HARNESS_NAMES,
  isFlowEvalCase,
  type DeterministicAssertion,
  type EvalCase,
  type FlowEvalCase,
  type SingleEvalCase,
} from "./eval-case-schema.js"
import {
  assertDeterministic,
  assertJudge,
  isJudgeOnly,
  resolveEvalModel,
} from "./assertions.js"
import type { NodeEvalFixturesLoader } from "./eval-fixtures-loader.js"
import type { BrowserEvalFixturesLoader } from "./eval-fixtures-loader.browser.js"
import {
  evalDebugContextFromCase,
  isEvalDebugEnabled,
  isEvalTimingDebugEnabled,
  logEvalCaseContext,
  logEvalCaseInvoke,
  logEvalCaseTiming,
} from "./eval-debug.js"
import {
  HARNESS_TASKS,
  BROWSER_NANO_HARNESS_CAPABILITY,
  type HarnessTask,
} from "../harness-bindings.js"
import { MATRIX_EVAL_EXTENSION_IDS } from "../harness-eval-config.js"

/** Options for {@link runEvalCase} when fixture loading or provider differ by runtime. */
export interface RunEvalCaseOptions {
  /** Use Vite-bundled fixtures (browser Vitest) instead of node:fs. */
  browserFixtures?: boolean
  /** Harness evaluate capability (default Browser Nano). */
  harnessCapability?: HarnessCapabilityId
  /** Harness-owned fixture loader (overrides default evals package paths). */
  fixturesLoader?: NodeEvalFixturesLoader | BrowserEvalFixturesLoader
  /** Extension ids for descriptor-order assertions (harness matrix binding order). */
  descriptorExtensionIds?: readonly string[]
}

function resolveInvokeInput(
  input: Record<string, unknown>,
  options?: RunEvalCaseOptions
): Record<string, unknown> {
  if (options?.fixturesLoader) {
    const loader = options.fixturesLoader
    const resolved = { ...input }
    const manifestRef = resolved.manifestRef
    if (typeof manifestRef === "string") {
      resolved.manifest = loader.loadWorkflowFixture(manifestRef)
      delete resolved.manifestRef
    }
    const runContextFixture = resolved.runContextFixture
    if (typeof runContextFixture === "string") {
      resolved.runContext = loader.loadHarnessRunFixture(runContextFixture)
      delete resolved.runContextFixture
    }
    return resolved
  }
  throw new Error(
    "runEvalCase requires options.fixturesLoader from createNodeEvalFixturesLoader or createBrowserEvalFixturesLoader"
  )
}

function resolveCaseInput(
  caseRow: SingleEvalCase,
  options?: RunEvalCaseOptions
): Record<string, unknown> {
  if (options?.fixturesLoader) {
    return options.fixturesLoader.resolveSingleEvalCaseInput(caseRow)
  }
  throw new Error(
    "runEvalCase requires options.fixturesLoader from createNodeEvalFixturesLoader or createBrowserEvalFixturesLoader"
  )
}

function withInvokeSuccessAssertion(
  assertions: DeterministicAssertion[]
): DeterministicAssertion[] {
  if (assertions.some((a) => a.kind === "invokeSuccess")) {
    return assertions
  }
  return [{ kind: "invokeSuccess" }, ...assertions]
}

function descriptorExtensionIds(options?: RunEvalCaseOptions): string[] {
  return [...(options?.descriptorExtensionIds ?? (MATRIX_EVAL_EXTENSION_IDS as unknown as string[]))]
}

const HARNESS_TASK_BY_CASE_NAME: Record<string, HarnessTask> = {
  [EVAL_HARNESS_NAMES.WORKFLOW_AUTHORING]: HARNESS_TASKS.WORKFLOW_AUTHORING,
  [EVAL_HARNESS_NAMES.INTENT_CLASSIFICATION]: HARNESS_TASKS.INTENT_CLASSIFICATION,
  [EVAL_HARNESS_NAMES.WORKFLOW_ASSISTANT]: HARNESS_TASKS.WORKFLOW_ASSISTANT,
  [EVAL_HARNESS_NAMES.CHAT]: HARNESS_TASKS.CHAT,
}

function withHarnessTask(
  harnessName: string,
  input: Record<string, unknown>
): Record<string, unknown> {
  const task = HARNESS_TASK_BY_CASE_NAME[harnessName]
  if (!task) {
    throw new Error(`Unknown eval harness name: ${harnessName}`)
  }
  return { task, ...input }
}

/** Execute a single-harness eval case against an initialized environment. @category Evals */
export async function runSingleEvalCase(
  ecp: Ecp,
  env: Environment,
  caseRow: SingleEvalCase,
  options?: RunEvalCaseOptions
): Promise<void> {
  const input = resolveCaseInput(caseRow, options)
  const model = resolveEvalModel(caseRow)
  if (model !== undefined) {
    input.model = model
  }

  const deterministic = withInvokeSuccessAssertion(caseRow.assertions.deterministic)
  const debugCtx = evalDebugContextFromCase(
    caseRow,
    withHarnessTask(caseRow.harness, input) as Record<string, unknown>
  )

  if (isEvalDebugEnabled()) {
    logEvalCaseContext({ ...debugCtx, assertions: deterministic })
  }

  const harnessCapability =
    options?.harnessCapability ?? (BROWSER_NANO_HARNESS_CAPABILITY as HarnessCapabilityId)

  const timingEnabled = isEvalTimingDebugEnabled()
  const caseStarted = timingEnabled ? performance.now() : 0
  const invokeStarted = timingEnabled ? performance.now() : 0

  const result = await ecp
    .invoke(harnessCapability)
    .with(withHarnessTask(caseRow.harness, input))
    .process()

  const invokeMs = timingEnabled ? performance.now() - invokeStarted : undefined

  if (isEvalDebugEnabled()) {
    logEvalCaseInvoke({ ...debugCtx, assertions: deterministic }, result)
  }

  const judge = caseRow.assertions.judge
  let assertMs: number | undefined
  let judgeMs: number | undefined

  try {
    if (!isJudgeOnly(judge)) {
      const assertStarted = timingEnabled ? performance.now() : 0
      const harnessOutput = await assertDeterministic(caseRow, result, deterministic, {
        ecp,
        env,
        descriptorExtensionIds: descriptorExtensionIds(options),
      })
      assertMs = timingEnabled ? performance.now() - assertStarted : undefined
      const judgeStarted = timingEnabled ? performance.now() : 0
      await assertJudge(caseRow, harnessOutput, judge, ecp)
      judgeMs = timingEnabled ? performance.now() - judgeStarted : undefined
    } else {
      if (!result.success) {
        throw new Error(`[${caseRow.id}] invoke failed in judge-only mode`)
      }
      const judgeStarted = timingEnabled ? performance.now() : 0
      await assertJudge(caseRow, result.result as never, judge, ecp)
      judgeMs = timingEnabled ? performance.now() - judgeStarted : undefined
    }
  } finally {
    if (timingEnabled) {
      const repairAttempts =
        result.success && result.result && typeof result.result === "object"
          ? (result.result as HarnessInvokeResult).trace?.repairAttempts
          : undefined
      if (repairAttempts?.length) {
        console.warn(formatRepairLoopTimingReport(caseRow.id, repairAttempts))
      }
      logEvalCaseTiming(caseRow.id, {
        invokeMs,
        assertMs,
        judgeMs,
        caseTotalMs: performance.now() - caseStarted,
        invokeSuccess: result.success,
      })
    }
  }
}

/** Execute a multi-step flow eval case. @category Evals */
export async function runFlowEvalCase(
  ecp: Ecp,
  env: Environment,
  caseRow: FlowEvalCase,
  options?: RunEvalCaseOptions
): Promise<void> {
  const model = resolveEvalModel(caseRow)

  for (let i = 0; i < caseRow.steps.length; i++) {
    const step = caseRow.steps[i]
    const input = resolveInvokeInput(step.input, options)
    if (model !== undefined) {
      input.model = model
    }

    const deterministic = withInvokeSuccessAssertion(step.assertions.deterministic)
    const debugCtx = evalDebugContextFromCase(
      caseRow,
      withHarnessTask(step.harness, input) as Record<string, unknown>,
      i
    )

    if (isEvalDebugEnabled()) {
      logEvalCaseContext({ ...debugCtx, assertions: deterministic })
    }

    const harnessCapability =
      options?.harnessCapability ?? (BROWSER_NANO_HARNESS_CAPABILITY as HarnessCapabilityId)

    const result = await ecp
      .invoke(harnessCapability)
      .with(withHarnessTask(step.harness, input))
      .process()

    if (isEvalDebugEnabled()) {
      logEvalCaseInvoke({ ...debugCtx, assertions: deterministic }, result)
    }

    const judge = step.assertions.judge

    if (!isJudgeOnly(judge)) {
      const harnessOutput = await assertDeterministic(caseRow, result, deterministic, {
        ecp,
        env,
        descriptorExtensionIds: descriptorExtensionIds(options),
        stepIndex: i,
      })
      await assertJudge(caseRow, harnessOutput, judge, ecp, i)
    } else {
      if (!result.success) {
        throw new Error(`[${caseRow.id}] step ${i} invoke failed`)
      }
      await assertJudge(caseRow, result.result as never, judge, ecp, i)
    }
  }
}

/** Execute any eval case (single or flow). @category Evals */
export async function runEvalCase(
  ecp: Ecp,
  env: Environment,
  caseRow: EvalCase,
  options?: RunEvalCaseOptions
): Promise<void> {
  if (isFlowEvalCase(caseRow)) {
    await runFlowEvalCase(ecp, env, caseRow, options)
    return
  }
  await runSingleEvalCase(ecp, env, caseRow, options)
}
