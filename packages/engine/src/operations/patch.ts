import type { PatchOp } from "@executioncontrolprotocol/protocol"

/**
 * Apply RFC 6902 JSON Patch with the `@<nodeId>` extension under `/steps`.
 * @category Environment
 */
export function applyPatch<T>(document: T, ops: readonly PatchOp[]): T {
  let current: unknown = structuredClone(document)
  for (let index = 0; index < ops.length; index += 1) {
    const op = ops[index]
    if (!op) continue
    try {
      current = applyOp(current, op)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Patch failed."
      throw Object.assign(new Error(`Patch op ${index}: ${message}`), {
        code: "ECP_PATCH_INVALID",
        opIndex: index,
      })
    }
  }
  return current as T
}

function applyOp(document: unknown, op: PatchOp): unknown {
  switch (op.op) {
    case "add":
      return add(document, decodePath(op.path, document), op.value)
    case "remove":
      return remove(document, decodePath(op.path, document))
    case "replace":
      return replace(document, decodePath(op.path, document), op.value)
    case "move":
      return move(document, decodePath(op.from ?? "", document), decodePath(op.path, document))
    case "copy":
      return copy(document, decodePath(op.from ?? "", document), decodePath(op.path, document))
    case "test":
      return test(document, decodePath(op.path, document), op.value)
    default:
      throw new Error(`Unknown op ${(op as PatchOp).op}.`)
  }
}

/**
 * Resolve a JSON Pointer, expanding one `/steps/@<nodeId>` segment to the node's pointer.
 */
function decodePath(pointer: string, document: unknown): string[] {
  if (pointer === "") return []
  if (!pointer.startsWith("/")) throw new Error(`Path ${pointer} must start with /.`)
  const raw = pointer
    .slice(1)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"))
  if (raw[0] === "steps" && typeof raw[1] === "string" && raw[1].startsWith("@")) {
    const nodeId = raw[1].slice(1)
    const found = findNodePath(document, nodeId)
    if (!found) throw new Error(`Unknown node id ${nodeId}.`)
    return [...found, ...raw.slice(2)]
  }
  return raw
}

function findNodePath(document: unknown, nodeId: string, prefix: string[] = []): string[] | undefined {
  if (!isRecord(document)) return undefined
  if (Array.isArray(document.steps)) {
    for (let index = 0; index < document.steps.length; index += 1) {
      const step = document.steps[index]
      const here = [...prefix, "steps", String(index)]
      if (isRecord(step) && step.id === nodeId) return here
      const nested = findNodePath(step, nodeId, here)
      if (nested) return nested
    }
  }
  if (Array.isArray(document.then)) {
    const found = findInSteps(document.then, nodeId, [...prefix, "then"])
    if (found) return found
  }
  if (Array.isArray(document.else)) {
    const found = findInSteps(document.else, nodeId, [...prefix, "else"])
    if (found) return found
  }
  if (Array.isArray(document.paths)) {
    for (let index = 0; index < document.paths.length; index += 1) {
      const line = document.paths[index]
      if (!Array.isArray(line)) continue
      const found = findInSteps(line, nodeId, [...prefix, "paths", String(index)])
      if (found) return found
    }
  }
  return undefined
}

function findInSteps(steps: unknown[], nodeId: string, prefix: string[]): string[] | undefined {
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]
    const here = [...prefix, String(index)]
    if (isRecord(step) && step.id === nodeId) return here
    const nested = findNodePath(step, nodeId, here)
    if (nested) return nested
  }
  return undefined
}

function add(document: unknown, path: string[], value: unknown): unknown {
  if (path.length === 0) return value
  const parentPath = path.slice(0, -1)
  const key = path.at(-1) ?? ""
  const parent = get(document, parentPath)
  if (Array.isArray(parent)) {
    const copyParent = [...parent]
    if (key === "-") copyParent.push(value)
    else {
      const index = toIndex(key, copyParent.length, true)
      copyParent.splice(index, 0, value)
    }
    return set(document, parentPath, copyParent)
  }
  if (!isRecord(parent)) throw new Error(`Cannot add at /${path.join("/")}.`)
  return set(document, parentPath, { ...parent, [key]: value })
}

function remove(document: unknown, path: string[]): unknown {
  if (path.length === 0) throw new Error("Cannot remove the root.")
  const parentPath = path.slice(0, -1)
  const key = path.at(-1) ?? ""
  const parent = get(document, parentPath)
  if (Array.isArray(parent)) {
    const index = toIndex(key, parent.length, false)
    const copyParent = [...parent]
    copyParent.splice(index, 1)
    return set(document, parentPath, copyParent)
  }
  if (!isRecord(parent) || !(key in parent)) throw new Error(`Cannot remove /${path.join("/")}.`)
  const copyParent = { ...parent }
  delete copyParent[key]
  return set(document, parentPath, copyParent)
}

function replace(document: unknown, path: string[], value: unknown): unknown {
  if (path.length === 0) return value
  get(document, path)
  return add(document, path, value)
}

function move(document: unknown, from: string[], to: string[]): unknown {
  const value = get(document, from)
  const removed = remove(document, from)
  return add(removed, to, value)
}

function copy(document: unknown, from: string[], to: string[]): unknown {
  return add(document, to, structuredClone(get(document, from)))
}

function test(document: unknown, path: string[], value: unknown): unknown {
  const actual = get(document, path)
  if (JSON.stringify(actual) !== JSON.stringify(value)) {
    throw new Error(`Test failed at /${path.join("/")}.`)
  }
  return document
}

function get(document: unknown, path: string[]): unknown {
  let current: unknown = document
  for (const part of path) {
    if (Array.isArray(current)) {
      const index = toIndex(part, current.length, false)
      current = current[index]
    } else if (isRecord(current) && part in current) {
      current = current[part]
    } else {
      throw new Error(`Path /${path.join("/")} does not exist.`)
    }
  }
  return current
}

function set(document: unknown, path: string[], value: unknown): unknown {
  if (path.length === 0) return value
  const root = structuredClone(document)
  let current: unknown = root
  for (let index = 0; index < path.length - 1; index += 1) {
    const part = path[index] ?? ""
    if (Array.isArray(current)) current = current[toIndex(part, current.length, false)]
    else if (isRecord(current)) current = current[part]
    else throw new Error(`Cannot set /${path.join("/")}.`)
  }
  const key = path.at(-1) ?? ""
  if (Array.isArray(current)) current[toIndex(key, current.length, true)] = value
  else if (isRecord(current)) current[key] = value
  else throw new Error(`Cannot set /${path.join("/")}.`)
  return root
}

function toIndex(token: string, length: number, allowEnd: boolean): number {
  if (!/^(0|[1-9]\d*)$/.test(token)) throw new Error(`Invalid array index ${token}.`)
  const index = Number(token)
  if (index < 0 || index > length || (!allowEnd && index >= length)) {
    throw new Error(`Array index ${token} out of range.`)
  }
  return index
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
