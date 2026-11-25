import type { ExecutionManifest, IfNode, LoopEndNode, LoopNode } from "@executioncontrolprotocol/protocol"

/**
 * Default {@link LoopEndNode} for a while loop that stops after one round.
 */
export const WHILE_END_STOP: LoopEndNode = {
  input: { repeat: false },
}

/**
 * Loop end that gathers `state.<path>` each round / item.
 */
export function loopEndValue(ref: string): LoopEndNode {
  return { input: { value: { $ref: ref } } }
}

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
    end: loopEndValue("state.out"),
    into: "collected",
    ...extra,
  }
}

/**
 * Minimal while loop shell with a stop `end`.
 */
export function whileLoop(extra: Partial<LoopNode> = {}): LoopNode {
  return {
    type: "loop",
    id: "loop",
    maxRounds: 1,
    steps: [],
    end: WHILE_END_STOP,
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
    steps: [],
    end: loopEndValue("state.last"),
    ...extra,
  }
}

/**
 * Convert a simple two-arm branch test into an `if` node.
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
