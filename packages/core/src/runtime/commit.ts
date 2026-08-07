import type { CommitMode } from "@executioncontrolprotocol/types"
import type { PendingMutation } from "@executioncontrolprotocol/types"
import { getAtPath, setAtPath } from "../util/path.js"

/** Apply staged mutations and step output commit. */
export function commitTransaction(options: {
  state: Record<string, unknown>
  mutations: PendingMutation[]
  output: unknown
  as?: string
  mode?: CommitMode
}): void {
  const { state, mutations, output, as: commitKey, mode: commitMode = "create" } = options

  for (const m of mutations) {
    if (m.op === "merge" && typeof m.value === "object") {
      const existing = getAtPath(state, m.path)
      setAtPath(state, m.path, {
        ...(typeof existing === "object" && existing !== null ? existing : {}),
        ...(m.value as object),
      })
    } else if (m.op === "append") {
      const existing = getAtPath(state, m.path)
      const arr = Array.isArray(existing) ? [...existing] : []
      arr.push(m.value)
      setAtPath(state, m.path, arr)
    } else {
      setAtPath(state, m.path, m.value)
    }
  }

  if (!commitKey) return

  const existing = state[commitKey]
  if (commitMode === "create" && existing !== undefined) {
    throw new Error(`State key '${commitKey}' already exists (mode: create)`)
  }
  if (commitMode === "merge" && typeof output === "object" && output !== null) {
    state[commitKey] = {
      ...(typeof existing === "object" && existing !== null ? existing : {}),
      ...output,
    }
  } else if (commitMode === "append") {
    const arr = Array.isArray(existing) ? [...existing] : []
    arr.push(output)
    state[commitKey] = arr
  } else {
    state[commitKey] = output
  }
}
