import { LATEST_ECP_VERSION } from "@executioncontrolprotocol/types"
import type {
  TestSessionSnapshot,
  TestSessionStatus,
  WorkflowManifest,
} from "@executioncontrolprotocol/types"
import type { Environment } from "../environment/environment.js"
import {
  clearDownstreamTestState,
  findTestStep,
  isLastTestStep,
} from "../runtime/test-session-state.js"

/** Options for starting a test session. @category Test */
export interface TestSessionStartOptions {
  /** Workflow input seed. */
  input?: Record<string, unknown>
}

/** Fluent builder for {@link TestSession}. @category Test */
export interface TestSessionBuilder {
  /** Set start options. */
  with(options: TestSessionStartOptions): this
  /** Create an idle session (does not execute steps). */
  start(): Promise<TestSession>
}

/** In-process workflow test session (run-to / rerun). @category Test */
export interface TestSession {
  /** Session id. */
  readonly id: string
  /** Serializable snapshot. */
  snapshot(): TestSessionSnapshot
  /** Inclusive run through `stepId`, then pause (or complete if last). */
  runTo(stepId: string): Promise<TestSessionSnapshot>
  /** Rerun one step; clear downstream history and `.as` keys. */
  rerun(stepId: string): Promise<TestSessionSnapshot>
}

/**
 * Create a test session builder bound to an environment.
 * @category Test
 */
export function createTestSessionBuilder(
  env: Environment,
  workflow: WorkflowManifest
): TestSessionBuilder {
  let input: Record<string, unknown> = {}

  const builder: TestSessionBuilder = {
    with(options: TestSessionStartOptions) {
      input = options.input ?? {}
      return builder
    },
    async start() {
      await env.ensureBoundExtensionsRegistered()
      await env.ensureReady()
      const sessionId = globalThis.crypto.randomUUID()
      const snap: TestSessionSnapshot = {
        schema: "@executioncontrolprotocol.test.session",
        version: LATEST_ECP_VERSION,
        sessionId,
        workflow,
        input: { ...input },
        state: { ...input },
        history: {},
        status: "idle",
      }
      return new TestSessionImpl(env, snap)
    },
  }

  return builder
}

/**
 * Restore a test session from a snapshot.
 * @category Test
 */
export async function restoreTestSession(
  env: Environment,
  snapshot: TestSessionSnapshot
): Promise<TestSession> {
  await env.ensureBoundExtensionsRegistered()
  await env.ensureReady()
  return new TestSessionImpl(env, {
    ...snapshot,
    state: { ...snapshot.state },
    history: { ...snapshot.history },
    input: { ...snapshot.input },
    workflow: snapshot.workflow,
  })
}

class TestSessionImpl implements TestSession {
  constructor(
    private readonly env: Environment,
    private snap: TestSessionSnapshot
  ) {}

  get id(): string {
    return this.snap.sessionId
  }

  snapshot(): TestSessionSnapshot {
    return {
      ...this.snap,
      state: { ...this.snap.state },
      history: { ...this.snap.history },
      input: { ...this.snap.input },
    }
  }

  async runTo(stepId: string): Promise<TestSessionSnapshot> {
    if (!findTestStep(this.snap.workflow, stepId)) {
      throw new Error(`Unknown step id: ${stepId}`)
    }

    const result = await this.env.ecpTestExecute(this.snap.workflow, {
      input: this.snap.input,
      seedState: this.snap.state,
      seedHistory: this.snap.history,
      stopAfterStepId: stepId,
    })

    this.applyRunResult(result, stepId)
    return this.snapshot()
  }

  async rerun(stepId: string): Promise<TestSessionSnapshot> {
    if (!findTestStep(this.snap.workflow, stepId)) {
      throw new Error(`Unknown step id: ${stepId}`)
    }

    const state = { ...this.snap.state }
    const history = { ...this.snap.history }
    clearDownstreamTestState(this.snap.workflow, state, history, stepId)

    const result = await this.env.ecpTestExecute(this.snap.workflow, {
      input: this.snap.input,
      seedState: state,
      seedHistory: history,
      onlyStepId: stepId,
    })

    this.applyRunResult(result, stepId)
    return this.snapshot()
  }

  private applyRunResult(
    result: Awaited<ReturnType<Environment["ecpTestExecute"]>>,
    cursorStepId: string
  ): void {
    this.snap = {
      ...this.snap,
      state: result.state ?? {},
      history: result.history ?? {},
      cursor: cursorStepId,
      status: mapRunStatusToSession(result.run.status, this.snap.workflow, cursorStepId),
    }
  }
}

function mapRunStatusToSession(
  runStatus: string,
  workflow: WorkflowManifest,
  cursorStepId: string
): TestSessionStatus {
  if (runStatus === "failed" || runStatus === "cancelled") return "failed"
  if (runStatus === "completed" || isLastTestStep(workflow, cursorStepId)) {
    return "completed"
  }
  if (runStatus === "paused") return "paused"
  return "paused"
}
