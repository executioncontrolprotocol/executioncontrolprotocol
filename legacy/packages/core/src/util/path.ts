/** Parsed path segment (object key or array index). @category Common */
type PathSegment = string | number

/**
 * Parse a lodash-style path (`steps[0].label`, `workflow.version`) into segments.
 * @category Common
 */
function parsePath(path: string): PathSegment[] {
  const segments: PathSegment[] = []
  let i = 0
  while (i < path.length) {
    if (path[i] === ".") {
      i++
      continue
    }
    if (path[i] === "[") {
      const end = path.indexOf("]", i)
      if (end === -1) {
        throw new Error(`Invalid path: ${path}`)
      }
      const index = Number(path.slice(i + 1, end))
      if (!Number.isInteger(index)) {
        throw new Error(`Invalid path index: ${path}`)
      }
      segments.push(index)
      i = end + 1
      continue
    }
    let j = i
    while (j < path.length && path[j] !== "." && path[j] !== "[") {
      j++
    }
    segments.push(path.slice(i, j))
    i = j
  }
  return segments
}

/**
 * Read a value at a lodash-style or dotted path.
 * @category Common
 */
export function getAtPath(obj: unknown, path: string): unknown {
  const segments = parsePath(path)
  let cur: unknown = obj
  for (const seg of segments) {
    if (cur === null || cur === undefined) {
      return undefined
    }
    if (typeof seg === "number") {
      cur = Array.isArray(cur) ? cur[seg] : undefined
      continue
    }
    cur = typeof cur === "object" ? (cur as Record<string, unknown>)[seg] : undefined
  }
  return cur
}

/**
 * Write a value at a lodash-style or dotted path, creating intermediate objects/arrays as needed.
 * @category Common
 */
export function setAtPath(obj: unknown, path: string, value: unknown): void {
  const segments = parsePath(path)
  if (segments.length === 0) {
    throw new Error("Empty path")
  }
  let cur: unknown = obj
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!
    const nextSeg = segments[i + 1]!
    if (typeof seg === "number") {
      if (!Array.isArray(cur)) {
        throw new Error(`Cannot index non-array at path: ${path}`)
      }
      if (cur[seg] === undefined || cur[seg] === null) {
        cur[seg] = typeof nextSeg === "number" ? [] : {}
      }
      cur = cur[seg]
      continue
    }
    const record = cur as Record<string, unknown>
    if (!(seg in record) || record[seg] === null || typeof record[seg] !== "object") {
      record[seg] = typeof nextSeg === "number" ? [] : {}
    }
    cur = record[seg]
  }
  const last = segments[segments.length - 1]!
  if (typeof last === "number") {
    if (!Array.isArray(cur)) {
      throw new Error(`Cannot index non-array at path: ${path}`)
    }
    cur[last] = value
    return
  }
  ;(cur as Record<string, unknown>)[last] = value
}

/**
 * Deep-merge plain objects (arrays and primitives from `source` replace `target`).
 * @category Common
 */
export function deepMerge<T extends object>(target: T, source: object): T {
  const result = structuredClone(target) as Record<string, unknown>
  for (const [key, value] of Object.entries(source)) {
    const existing = result[key]
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      existing !== null &&
      typeof existing === "object" &&
      !Array.isArray(existing)
    ) {
      result[key] = deepMerge(existing as object, value as object)
    } else {
      result[key] = structuredClone(value)
    }
  }
  return result as T
}
