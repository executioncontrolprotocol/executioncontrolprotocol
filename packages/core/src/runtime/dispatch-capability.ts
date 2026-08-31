import {
  ECP_INVOKE_ERROR_CODES,
  LATEST_ECP_VERSION,
  type CapabilityId,
  type InvokeResult,
} from "@executioncontrolprotocol/types"
import type { Registry } from "../registry/registry.js"
import type { CapabilityContext } from "./context.js"
import { resolveCapabilityExecution, isBrowserRuntimeId } from "./capability-execution.js"
import {
  hopRemoteInvoke,
  invokeFailure,
  type RemoteInvokeBinding,
} from "./remote-invoke.js"
import type { CapabilityDefinition, ExtensionDefinition } from "../definitions/types.js"
import {
  collectBrowserLocators,
  serializeCapabilityBlobs,
} from "./blobs.js"

/** Error thrown when dispatch cannot produce handler output. @category Runtime */
export class CapabilityDispatchError extends Error {
  /** Structured invoke failure. */
  readonly result: InvokeResult

  constructor(result: InvokeResult) {
    super(result.diagnostics[0]?.message ?? "Capability dispatch failed")
    this.name = "CapabilityDispatchError"
    this.result = result
  }
}

/** Inputs for {@link dispatchCapability}. @category Runtime */
export interface DispatchCapabilityOptions {
  /** Capability id to run or hop. */
  capabilityId: string
  /** Capability input. */
  input: unknown
  /** Handler context (nested `call` should use this dispatcher). */
  ctx: CapabilityContext
  /** Live registry. */
  registry: Registry
  /** Current environment runtime id. */
  runtimeId: string
  /** Remote invoke host when this environment hops. */
  remoteInvoke?: RemoteInvokeBinding
}

function extensionForCapability(
  registry: Registry,
  cap: CapabilityDefinition
): ExtensionDefinition | undefined {
  const extId = cap.id.replace(/\.[^.]+$/, "")
  return registry.getExtension(extId)
}

function remoteRequiredMessage(capabilityId: string): string {
  return `Capability ${capabilityId} requires a local host. Start \`ecp up --env …\`.`
}

/**
 * Run a capability locally or hop to `POST /v1/invoke` on the same id.
 * Returns handler output. Throws {@link CapabilityDispatchError} on failure.
 * @category Runtime
 */
export async function dispatchCapability(options: DispatchCapabilityOptions): Promise<unknown> {
  const { capabilityId, input, ctx, registry, runtimeId, remoteInvoke } = options
  const cap = registry.getCapability(capabilityId)
  if (!cap) {
    throw new CapabilityDispatchError(
      invokeFailure(
        capabilityId,
        ECP_INVOKE_ERROR_CODES.CAPABILITY_NOT_FOUND,
        `Capability not registered: ${capabilityId}`
      )
    )
  }

  const ext = extensionForCapability(registry, cap)
  const execution = resolveCapabilityExecution(cap, ext)
  const onBrowser = isBrowserRuntimeId(runtimeId)
  const hopHost = execution === "host" && onBrowser
  const mixedNeedsHost = execution === "mixed" && onBrowser

  if (hopHost || mixedNeedsHost) {
    if (!remoteInvoke?.url || !remoteInvoke.token) {
      throw new CapabilityDispatchError(
        invokeFailure(
          capabilityId,
          ECP_INVOKE_ERROR_CODES.REMOTE_INVOKE_REQUIRED,
          remoteRequiredMessage(capabilityId)
        )
      )
    }
  }

  if (hopHost) {
    const locators = collectBrowserLocators(input)
    const blobs =
      ctx.blobs && locators.length > 0
        ? await serializeCapabilityBlobs(ctx.blobs, locators)
        : undefined
    const hopped = await hopRemoteInvoke(remoteInvoke!, capabilityId, input, blobs)
    if (!hopped.success) {
      throw new CapabilityDispatchError(hopped)
    }
    return hopped.result
  }

  try {
    return await cap.handler(input, ctx)
  } catch (err) {
    if (err instanceof CapabilityDispatchError) throw err
    const message = err instanceof Error ? err.message : String(err)
    throw new CapabilityDispatchError(
      invokeFailure(capabilityId, ECP_INVOKE_ERROR_CODES.INVOKE_FAILED, message)
    )
  }
}

/**
 * Nested `ctx.capabilities.call` that uses the same local/hop dispatcher.
 * @category Runtime
 */
export function createDispatchingCall(
  options: Omit<DispatchCapabilityOptions, "capabilityId" | "input">
): (id: string, input: unknown) => Promise<unknown> {
  return (id, input) => dispatchCapability({ ...options, capabilityId: id, input })
}

/**
 * Like {@link dispatchCapability} but always returns an {@link InvokeResult}.
 * @category Runtime
 */
export async function dispatchCapabilityResult(
  options: DispatchCapabilityOptions
): Promise<InvokeResult> {
  try {
    const output = await dispatchCapability(options)
    return {
      schema: "@executioncontrolprotocol.invoke.result",
      version: LATEST_ECP_VERSION,
      success: true,
      capabilityId: options.capabilityId as CapabilityId,
      result: output,
      diagnostics: [],
    }
  } catch (err) {
    if (err instanceof CapabilityDispatchError) return err.result
    const message = err instanceof Error ? err.message : String(err)
    return invokeFailure(
      options.capabilityId,
      ECP_INVOKE_ERROR_CODES.INVOKE_FAILED,
      message
    )
  }
}
