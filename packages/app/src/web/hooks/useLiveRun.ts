import { useCallback, useEffect, useRef, useState } from "react"
import type { OperationError, RunStatus, ValidationIssue } from "@executioncontrolprotocol/protocol"
import {
  followRun,
  HostRequestError,
  issueFromError,
  UnauthorizedError,
  type AppHostClient,
} from "../../client/index.js"
import {
  applyRunEvent,
  createRunGraphState,
  reactFlowRunProgress,
  reduceRunEvent,
  type RunGraphState,
} from "../../graph/index.js"
import { executionRef, type ExecutionSource } from "./useExecutionDocument.js"

/**
 * The run started from the Run view, as it progresses.
 * @category App
 */
export interface LiveRunState {
  /** Run id once `execute` accepted the run. */
  runId?: string
  /** True from Run until the run leaves `running`. */
  busy: boolean
  /** Final status, once known. */
  status?: RunStatus
  /** Graph statuses folded from run events. */
  graph: RunGraphState
  /** Result once the run ends. */
  result?: Record<string, unknown> | null
  /** Run failure or refusal, as an issue. */
  error?: ValidationIssue | null
  /** Issues attached to a refusal (for example rejected input). */
  refusalIssues?: ValidationIssue[]
}

function refusalState(error: OperationError): Pick<LiveRunState, "error" | "refusalIssues"> {
  return { error: issueFromError(error), refusalIssues: error.issues ?? [] }
}

/**
 * Start runs with `execute { wait: false }` and follow them until they end. The run keeps
 * going when the execution reloads; it stops being followed when the workspace unmounts.
 * @category App
 */
export function useLiveRun(
  client: AppHostClient,
  source: ExecutionSource,
  onUnauthorized: () => void,
): LiveRunState & { start: (input: Record<string, unknown>) => void } {
  const [state, setState] = useState<LiveRunState>({ busy: false, graph: createRunGraphState() })
  const follow = useRef<AbortController | undefined>(undefined)

  useEffect(() => () => follow.current?.abort(), [])

  const start = useCallback(
    (input: Record<string, unknown>) => {
      follow.current?.abort()
      const controller = new AbortController()
      follow.current = controller
      setState({ busy: true, graph: createRunGraphState(), result: null, error: null })
      void (async () => {
        try {
          const response = await client.execute({ execution: executionRef(source), input, wait: false })
          if (controller.signal.aborted) return
          if (!response.ok) {
            setState((prev) => ({ ...prev, busy: false, ...refusalState(response.error) }))
            return
          }
          if (!("runId" in response.data)) {
            setState((prev) => ({ ...prev, busy: false }))
            return
          }
          const { runId, status } = response.data
          setState((prev) => ({ ...prev, runId, status }))
          await followRun(
            client,
            runId,
            {
              onEvent: (event) => {
                applyRunEvent(reactFlowRunProgress, event, runId)
                setState((prev) => ({ ...prev, graph: reduceRunEvent(prev.graph, event) }))
              },
              onDone: (detail) =>
                setState((prev) => ({
                  ...prev,
                  busy: false,
                  status: detail.status,
                  result: detail.result,
                  error: detail.error,
                })),
              onUnauthorized,
            },
            controller.signal,
          )
        } catch (error) {
          if (controller.signal.aborted) return
          if (error instanceof UnauthorizedError) return
          const refusal =
            error instanceof HostRequestError
              ? error.error
              : { code: "ECP_INTERNAL", message: error instanceof Error ? error.message : String(error) }
          setState((prev) => ({ ...prev, busy: false, ...refusalState(refusal) }))
        }
      })()
    },
    [client, source, onUnauthorized],
  )

  return { ...state, start }
}
