import type { Interfaces } from "@oclif/core"
import type { z } from "zod"
import type { EcpHost } from "./host.js"

/**
 * Optional CLI hint on an operation: positional argument field names.
 * @category CLI
 */
export interface OperationCliHint {
  /** Input-schema field names that become positional args, in order. */
  args?: string[]
}

/**
 * Agent-facing metadata for a host operation.
 * @category CLI
 */
export interface OperationMetadata {
  /** One-line summary. */
  summary: string
  /** Longer description. */
  description?: string
  /** When to use this command. */
  useCases?: string[]
  /** Example invocations. */
  examples?: string[]
  /** oclif command aliases (for example `run` for `workflows:run`). */
  aliases?: string[]
  /** Positional argument mapping. */
  cli?: OperationCliHint
}

/**
 * Context passed to an operation handler.
 * @category CLI
 */
export interface OperationContext {
  /** Process host, when the init hook has run. */
  host: EcpHost | undefined
  /** oclif config. */
  config: Interfaces.Config
  /** Parsed argv after the command id. */
  argv: string[]
  /** True when `--json` was passed. */
  json: boolean
}

/**
 * Host command definition (CLI's own commands). Not usable as a workflow step.
 * @category CLI
 */
export interface OperationDefinition {
  /** Command id (`workflows:run`, `plugins:new`, `config:secrets:add`). */
  name: string
  /** Zod schema for merged flags and args. */
  inputSchema: z.ZodType
  /** Agent-facing docs. */
  metadata: OperationMetadata
  /** Run the operation; return value becomes envelope `data`. */
  handler: (input: Record<string, unknown>, ctx: OperationContext) => Promise<unknown>
}

class OperationBuilder {
  private inputSchema?: z.ZodType
  private metadata?: OperationMetadata
  private handler?: OperationDefinition["handler"]

  constructor(private readonly name: string) {}

  /** Set the input schema. */
  withInput(schema: z.ZodType): this {
    this.inputSchema = schema
    return this
  }

  /** Set command metadata. */
  withMetadata(metadata: OperationMetadata): this {
    this.metadata = metadata
    return this
  }

  /** Set the handler. */
  withHandler(handler: OperationDefinition["handler"]): this {
    this.handler = handler
    return this
  }

  /** Build a plain operation definition. */
  build(): OperationDefinition {
    if (!this.inputSchema) throw new Error(`Operation ${this.name} is missing withInput`)
    if (!this.metadata?.summary) throw new Error(`Operation ${this.name} is missing metadata.summary`)
    if (!this.handler) throw new Error(`Operation ${this.name} is missing withHandler`)
    return {
      name: this.name,
      inputSchema: this.inputSchema,
      metadata: this.metadata,
      handler: this.handler,
    }
  }
}

/**
 * Start a host-operation builder. The CLI's own commands are operations.
 * @category CLI
 */
export function defineOperation(name: string): OperationBuilder {
  return new OperationBuilder(name)
}
