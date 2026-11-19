import { useEffect, useState } from "react"
import type { RunDetail, StepRecord } from "@executioncontrolprotocol/protocol"
import { retrieveItem, UnauthorizedError, type AppHostClient } from "../../client/index.js"
import { valueAtInputPath, valueAtStateRef } from "../../graph/index.js"

const PREVIEW_MAX = 1_200

/**
 * Resolved source/target values shown on the edge inspector.
 * @category App
 */
export interface EdgeRunPayload {
  /** Run the values came from, when known. */
  runId?: string
  /** Whether the data is from a live run or a selected replay. */
  source: "none" | "live" | "replay"
  /** Step has not completed yet. */
  stepPending?: boolean
  sourceValue?: unknown
  targetValue?: unknown
}

function previewJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/**
 * Truncate JSON for the edge panel; full text is available when expanded.
 * @category App
 */
export function truncatePayloadPreview(text: string): { preview: string; truncated: boolean } {
  if (text.length <= PREVIEW_MAX) return { preview: text, truncated: false }
  return { preview: `${text.slice(0, PREVIEW_MAX)}\n…`, truncated: true }
}

function stepForNode(steps: StepRecord[] | undefined, nodeId: string): StepRecord | undefined {
  return steps?.find((step) => step.nodeId === nodeId)
}

/**
 * Load `steps` and `state` for the edge payload section when a run is live or replayed.
 * @category App
 */
export function useEdgeRunPayload(
  client: AppHostClient,
  runId: string | undefined,
  source: "live" | "replay" | "none",
  targetStepId: string,
  statePath: string | undefined,
  inputPath: string,
): EdgeRunPayload {
  const [payload, setPayload] = useState<EdgeRunPayload>({ source: "none" })

  useEffect(() => {
    if (!runId || source === "none") {
      setPayload({ source: "none" })
      return
    }
    let alive = true
    void (async () => {
      try {
        const response = await client.retrieve({ type: "run", id: runId, include: ["steps", "state"] })
        if (!alive) return
        if (!response.ok) {
          setPayload({ source, runId, stepPending: true })
          return
        }
        const detail = retrieveItem<RunDetail>(response)
        const step = stepForNode(detail?.steps, targetStepId)
        if (!step) {
          setPayload({ source, runId, stepPending: true })
          return
        }
        const state = (detail?.state ?? {}) as Record<string, unknown>
        setPayload({
          source,
          runId,
          sourceValue: valueAtStateRef(state, statePath),
          targetValue: valueAtInputPath(step.input, inputPath),
        })
      } catch (error) {
        if (!alive || error instanceof UnauthorizedError) return
        setPayload({ source, runId, stepPending: true })
      }
    })()
    return () => {
      alive = false
    }
  }, [client, runId, source, targetStepId, statePath, inputPath])

  return payload
}

/**
 * Format a payload value for display in the edge panel.
 * @category App
 */
export function formatPayloadJson(value: unknown): string {
  if (value === undefined) return ""
  return previewJson(value)
}