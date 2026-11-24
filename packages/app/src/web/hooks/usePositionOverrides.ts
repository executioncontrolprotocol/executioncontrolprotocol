import { useCallback, useEffect, useRef, useState } from "react"
import {
  parsePositionOverrides,
  positionStorageKey,
  prunePositionOverrides,
  type PositionOverrides,
} from "../../graph/positions.js"
import type { ExecutionSource } from "./useExecutionDocument.js"

function readStorage(key: string): PositionOverrides {
  try {
    return parsePositionOverrides(localStorage.getItem(key))
  } catch {
    return {}
  }
}

function writeStorage(key: string, overrides: PositionOverrides): void {
  try {
    localStorage.setItem(key, JSON.stringify(overrides))
  } catch {
    // ignore quota or private mode
  }
}

function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

function overridesEqual(a: PositionOverrides, b: PositionOverrides): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((id) => {
    const left = a[id]
    const right = b[id]
    return right !== undefined && left.x === right.x && left.y === right.y
  })
}

/**
 * Browser-only node position overrides for the open execution.
 * @category App
 */
export function usePositionOverrides(
  source: ExecutionSource,
  nonFrameIds: readonly string[],
  frameIds: readonly string[],
) {
  const storageKey = positionStorageKey(
    source.kind === "path" ? { kind: "path", path: source.path } : { kind: "id", id: source.id },
  )
  const [overrides, setOverrides] = useState<PositionOverrides>(() => readStorage(storageKey))
  const prevIdsRef = useRef<ReadonlySet<string>>(new Set(nonFrameIds))

  useEffect(() => {
    setOverrides(readStorage(storageKey))
    prevIdsRef.current = new Set(nonFrameIds)
  }, [storageKey])

  const commit = useCallback(
    (next: PositionOverrides | ((current: PositionOverrides) => PositionOverrides)) => {
      setOverrides((current) => {
        const resolved = typeof next === "function" ? next(current) : next
        writeStorage(storageKey, resolved)
        return resolved
      })
    },
    [storageKey],
  )

  const clear = useCallback(() => {
    setOverrides({})
    removeStorage(storageKey)
  }, [storageKey])

  useEffect(() => {
    const nextIds = new Set(nonFrameIds)
    const frameIdSet = new Set(frameIds)
    setOverrides((current) => {
      const pruned = prunePositionOverrides(current, prevIdsRef.current, nextIds, frameIdSet)
      prevIdsRef.current = nextIds
      if (overridesEqual(current, pruned)) return current
      writeStorage(storageKey, pruned)
      return pruned
    })
  }, [frameIds, nonFrameIds, storageKey])

  return { overrides, commit, clear }
}