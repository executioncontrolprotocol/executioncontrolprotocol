import type { ExecutionManifest, IfNode, LoopNode } from "@executioncontrolprotocol/protocol"

/**
 * Reference forEach loop used across engine tests.
 */
export function foreachLoop(extra: Partial<LoopNode> = {}): LoopNode {
  return {
    type: "loop",
    mode: "forEach",
    id: "items",
    input: { items: { $ref: "state.rows" } },
    as: "row",
    concurrency: 2,
    steps: [
      {
        id: "body",
        uses: "@executioncontrolprotocol/test.echo",
        input: { value: { $ref: "state.row" } },
        as: "out",
      },
    ],
    ...extra,
  }
}

/**
 * `for` loop shell with `input.count`.
 */
export function forLoop(extra: Partial<LoopNode> = {}): LoopNode {
  return {
    type: "loop",
    mode: "for",
    id: "counted",
    input: { count: { $ref: "state.n" } },
    as: "i",
    steps: [
      {
        id: "body",
        uses: "@executioncontrolprotocol/test.echo",
        input: { value: { $ref: "state.i" } },
        as: "out",
        mode: "replace",
      },
    ],
    ...extra,
  }
}

/**
 * Convert a simple two-arm test into an `if` node.
 */
export function ifTrueThenElse(thenSteps: IfNode["then"], elseSteps?: IfNode["then"], expression = "true"): IfNode {
  return {
    type: "if",
    id: "route",
    expression,
    then: thenSteps,
    ...(elseSteps ? { else: elseSteps } : {}),
  }
}

export function manifestWithSteps(steps: ExecutionManifest["steps"]): ExecutionManifest {
  return { schema: "@executioncontrolprotocol.execution", version: "2.0", steps }
}