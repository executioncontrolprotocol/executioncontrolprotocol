import type { CapabilityId, CommitMode, InputValue } from "../types/index.js"
import type { ExprValue } from "../types/index.js"
import type { StepNode } from "../types/index.js"
import { slugify } from "../util/slug.js"

/** Commit options for `.as()`. */
export interface AsOptions {
  mode?: CommitMode
}

/**
 * Augmentable map of capability id → step input shape.
 * Empty by default so any capability id and open input records work.
 * `ecp workflows types` augments this interface for editor autocomplete.
 * @category Workflow
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentional augmentation target
export interface CapabilityInputs {}

/**
 * Capability id accepted by {@link step}.
 * Any string when {@link CapabilityInputs} is unaugmented; otherwise only known ids.
 * @category Workflow
 */
export type CapabilityRef = [keyof CapabilityInputs] extends [never]
  ? string
  : keyof CapabilityInputs & string

/**
 * Step input type for a capability id.
 * @category Workflow
 */
export type StepInputFor<K extends string> = [keyof CapabilityInputs] extends [never]
  ? Record<string, InputValue>
  : K extends keyof CapabilityInputs
    ? CapabilityInputs[K]
    : never

/** Fluent step builder. @category Workflow */
export class StepBuilder<K extends string = string> {
  private input: Record<string, InputValue> = {}
  private asKey?: string
  private asMode?: CommitMode
  private whenExpr?: ExprValue
  private stepId?: string

  constructor(
    private readonly uses: CapabilityId | string,
    readonly label?: string
  ) {}

  /** Set step input. */
  with(input: StepInputFor<K>): this {
    this.input = { ...this.input, ...(input as Record<string, InputValue>) }
    return this
  }

  /** Conditional execution. */
  when(condition: ExprValue): this {
    this.whenExpr = condition
    return this
  }

  /** Commit output to workflow state. */
  as(key: string, options?: AsOptions): this {
    this.asKey = key
    if (options?.mode) this.asMode = options.mode
    return this
  }

  /** Override step id. */
  id(id: string): this {
    this.stepId = id
    return this
  }

  /** Serialize to manifest step node. */
  toNode(): StepNode {
    const id = this.stepId ?? slugify(this.label ?? String(this.uses))
    return {
      type: "step",
      id,
      ...(this.label ? { label: this.label } : {}),
      uses: this.uses,
      ...(Object.keys(this.input).length > 0 ? { input: this.input } : {}),
      ...(this.asKey ? { as: this.asKey } : {}),
      ...(this.asMode ? { mode: this.asMode } : {}),
      ...(this.whenExpr ? { when: this.whenExpr } : {}),
    }
  }
}

/**
 * Define a workflow step.
 * @category Workflow
 */
export function step<K extends CapabilityRef>(
  ref: K,
  label?: string
): StepBuilder<K> {
  return new StepBuilder(ref, label)
}
