import type { CapabilityId, HarnessId } from "@executioncontrolprotocol/types"
import type { HarnessDefinition } from "../harness/types.js"
import { normalizeHarnessId } from "../harness/harness-catalog.js"

/** Harness environment binding builder. @category Environment */
export class HarnessBindingBuilder {
  private providerCapabilityId?: CapabilityId
  private config: Record<string, unknown> = {}

  constructor(
    private readonly ref: HarnessId | HarnessDefinition | string,
    private readonly label?: string
  ) {}

  /** Default model provider capability (`@executioncontrolprotocol/ollama.generate`). */
  uses(capabilityId: CapabilityId | string): this {
    this.providerCapabilityId = capabilityId as CapabilityId
    return this
  }

  /** Harness configuration. */
  with(config: Record<string, unknown>): this {
    this.config = { ...this.config, ...config }
    return this
  }

  getRef(): HarnessId {
    if (typeof this.ref === "object" && "id" in this.ref) return this.ref.id
    return normalizeHarnessId(String(this.ref))
  }

  getLabel(): string | undefined {
    return this.label
  }

  getUses(): CapabilityId | undefined {
    return this.providerCapabilityId
  }

  getConfig(): Record<string, unknown> {
    return this.config
  }
}

/**
 * Bind a harness to an environment.
 * @category Environment
 */
export function harness(
  ref: HarnessId | HarnessDefinition | string,
  label?: string
): HarnessBindingBuilder {
  return new HarnessBindingBuilder(ref, label)
}
