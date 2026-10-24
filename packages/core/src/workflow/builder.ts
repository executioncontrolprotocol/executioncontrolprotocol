import { ECP_BINDING_INVALID, EcpError, LATEST_ECP_VERSION } from "../types/index.js"
import type {
  EnvironmentDescriptor,
  RequirementsDocument,
  ValidationResult,
  WorkflowManifest,
  WorkflowNode,
} from "../types/index.js"
import type { z } from "zod"
import { slugify } from "../util/slug.js"
import type { StepBuilder } from "../bindings/step.js"
import { validateWorkflow } from "../validate/workflow.js"
import { assignUniqueStepIds } from "./assign-unique-step-ids.js"
import {
  renderWorkflowToFluent,
  type RenderWorkflowToFluentOptions,
} from "../fluent/render-workflow.js"
import { isZodType, jsonSchemaFromZod } from "../schema/json-schema.js"
import {
  buildRequirementsDocument,
  type WorkflowBinding,
} from "./requirements.js"

type NodeInput = StepBuilder | WorkflowNode

function toNode(n: NodeInput): WorkflowNode {
  return "toNode" in n ? n.toNode() : n
}

function toJsonSchema(schema: z.ZodType | Record<string, unknown>): Record<string, unknown> {
  return isZodType(schema) ? jsonSchemaFromZod(schema) : { ...schema }
}

function omitEmptySchema(
  schema: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!schema) return undefined
  const props = schema.properties
  const hasProps =
    props !== null &&
    typeof props === "object" &&
    !Array.isArray(props) &&
    Object.keys(props).length > 0
  if (!hasProps && schema.type === "object") return undefined
  if (Object.keys(schema).length === 0) return undefined
  return schema
}

/** Fluent workflow builder. @category Workflow */
export class WorkflowBuilder {
  private nodes: WorkflowNode[] = []
  private workflowId?: string
  private acceptsSchema?: Record<string, unknown>
  private returnsSchema?: Record<string, unknown>
  private bindings?: WorkflowBinding[]

  constructor(private readonly label: string) {}

  /**
   * Bind extensions and policies this workflow file requires.
   * Call at most once. Bindings compile into a requirements document, never into the manifest.
   * @category Workflow
   */
  with(bindings: WorkflowBinding[]): this {
    if (this.bindings !== undefined) {
      throw new EcpError(ECP_BINDING_INVALID, "workflow().with() can be called only once")
    }
    this.bindings = bindings
    return this
  }

  /** Add sequential steps or flow nodes. */
  run(nodes: NodeInput[]): this {
    this.nodes.push(...nodes.map(toNode))
    return this
  }

  /** Set workflow id override. */
  id(id: string): this {
    this.workflowId = id
    return this
  }

  /**
   * Declare run input JSON Schema (`workflow.accepts`).
   * Pass a Zod object or a JSON Schema object; property names seed state (`ref("name")`).
   */
  accepts(schema: z.ZodType | Record<string, unknown>): this {
    this.acceptsSchema = toJsonSchema(schema)
    return this
  }

  /**
   * Declare public output JSON Schema (`workflow.returns`).
   * Property names are top-level state keys (typically a step `.as()`).
   */
  returns(schema: z.ZodType | Record<string, unknown>): this {
    this.returnsSchema = toJsonSchema(schema)
    return this
  }

  /** Build manifest without validation. */
  compile(): WorkflowManifest {
    return this.toManifest()
  }

  /**
   * Requirements compiled from `.with()` plus inferred step ids.
   * Not part of the portable workflow manifest.
   * @category Workflow
   */
  requirements(): RequirementsDocument {
    return buildRequirementsDocument(this.bindings, this.toManifest().steps)
  }

  /** Bindings from `.with()`, if any. @category Workflow */
  getBindings(): WorkflowBinding[] {
    return this.bindings ? [...this.bindings] : []
  }

  /** Alias for compile(). */
  toManifest(): WorkflowManifest {
    const accepts = omitEmptySchema(this.acceptsSchema)
    const returns = omitEmptySchema(this.returnsSchema)
    return assignUniqueStepIds({
      schema: "@executioncontrolprotocol.workflow",
      version: LATEST_ECP_VERSION,
      workflow: {
        id: this.workflowId ?? slugify(this.label),
        label: this.label,
        ...(accepts ? { accepts } : {}),
        ...(returns ? { returns } : {}),
      },
      steps: this.nodes,
    })
  }

  /** Render this workflow as Fluent API TypeScript source. */
  toFluentSource(options?: RenderWorkflowToFluentOptions): string {
    return renderWorkflowToFluent(this.toManifest(), options)
  }

  /** Validate against optional environment descriptor. */
  validate(descriptor?: EnvironmentDescriptor): ValidationResult {
    return validateWorkflow(this.toManifest(), descriptor)
  }

  /** Graph representation for visualization. */
  toGraph(): { nodes: WorkflowNode[]; label: string } {
    return { nodes: this.nodes, label: this.label }
  }
}

/**
 * Define a workflow.
 * @category Workflow
 */
export function workflow(label: string): WorkflowBuilder {
  return new WorkflowBuilder(label)
}
