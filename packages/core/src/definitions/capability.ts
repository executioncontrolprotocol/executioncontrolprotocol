import type { CapabilityId, NamespacedId, CapabilityExecution } from "@executioncontrolprotocol/types"
import type { z } from "zod"
import type { CapabilityDefinition, CapabilityHandler } from "./types.js"

/** Fluent capability builder. @category Definitions */
export class CapabilityBuilder {
  private inputSchema?: z.ZodType<unknown>
  private outputSchema?: z.ZodType<unknown>
  private handlerFn?: CapabilityHandler
  private execution?: CapabilityExecution

  constructor(
    private readonly extensionId: NamespacedId,
    private readonly name: string
  ) {}

  /** Set input Zod schema. */
  withInput<T extends z.ZodType<unknown>>(schema: T): this {
    this.inputSchema = schema
    return this
  }

  /** Set output Zod schema. */
  withOutput<T extends z.ZodType<unknown>>(schema: T): this {
    this.outputSchema = schema
    return this
  }

  /** Declare where this capability executes (`local` | `host` | `mixed`). @category Definitions */
  withExecution(execution: CapabilityExecution): this {
    this.execution = execution
    return this
  }

  /** Set capability handler. */
  withHandler(handler: CapabilityHandler): CapabilityDefinition {
    this.handlerFn = handler
    const id = `${this.extensionId}.${this.name}` as CapabilityId
    if (!this.handlerFn) {
      throw new Error(`Capability ${id} requires a handler`)
    }
    return {
      name: this.name,
      id,
      inputSchema: this.inputSchema,
      outputSchema: this.outputSchema,
      handler: this.handlerFn,
      ...(this.execution ? { execution: this.execution } : {}),
    }
  }
}

/**
 * Define a capability (use inside extension; prefer `capabilityFor`).
 * @category Definitions
 */
export function capability(name: string): CapabilityBuilder {
  return new CapabilityBuilder("@executioncontrolprotocol/placeholder" as NamespacedId, name)
}

/** Bind capability builder to extension id. @category Definitions */
export function capabilityFor(
  extensionId: NamespacedId,
  name: string
): CapabilityBuilder {
  return new CapabilityBuilder(extensionId, name)
}
