import {
  defineExtension,
  capabilityFor,
  type CapabilityDefinition,
  type CapabilityHandler,
  type ExtensionDefinition,
} from "@executioncontrolprotocol/core"
import { z } from "zod"
import { storageReadInputSchema, storageReadOutputSchema, storageWriteInputSchema, storageWriteOutputSchema } from "./schemas.js"

/** Extension id. @category Storage */
export const EXT_ID = "@executioncontrolprotocol/storage"

/** Message when browser catalog handlers are invoked without a host hop. @category Storage */
export const HOST_HOP_MESSAGE =
  "Storage read/write require a host runtime (ecp up). Pair the browser demo with the local daemon."

/** Handlers for storage capabilities. @category Storage */
export interface StorageCapabilityHandlers {
  write: CapabilityHandler
  read: CapabilityHandler
}

/**
 * Shared capability shells — Node and browser swap handlers only.
 * @category Storage
 */
export function buildStorageCapabilities(
  handlers: StorageCapabilityHandlers
): CapabilityDefinition[] {
  return [
    capabilityFor(EXT_ID, "write")
      .withInput(storageWriteInputSchema)
      .withOutput(storageWriteOutputSchema)
      .withExecution("host")
      .withMetadata({
        summary: "Store a value under a logical key on disk",
        description:
          "Writes bytes or JSON under ~/.ecp/temp (default) or ~/.ecp/artifacts (durable). Temp is wiped when ecp up starts; durable survives restarts.",
        useCases: [
          "Park workflow media outputs for the current ecp up session",
          "Persist a user-pinned artifact across daemon restarts",
        ],
        samplePrompts: [
          "Save this image under key session/out.png in temp storage",
          "Write the compiled payload to durable storage",
        ],
      })
      .withHandler(handlers.write),
    capabilityFor(EXT_ID, "read")
      .withInput(storageReadInputSchema)
      .withOutput(storageReadOutputSchema)
      .withExecution("host")
      .withMetadata({
        summary: "Read a previously stored value by key",
        description:
          "Returns the value for a key from temp or durable disk storage, or undefined when missing.",
        useCases: [
          "Downstream step loads a media artifact written earlier",
          "Serve preview bytes for an ecp://storage/… URI",
        ],
        samplePrompts: [
          "Read the value stored under session/out.png",
          "Fetch the durable artifact for this key",
        ],
      })
      .withHandler(handlers.read),
  ]
}

/**
 * Build the storage extension definition.
 * @category Storage
 */
export function buildStorageExtension(
  handlers: StorageCapabilityHandlers
): ExtensionDefinition {
  return defineExtension("@executioncontrolprotocol", "storage")
    .withConfig({
      prefix: z.string().optional(),
      home: z.string().optional(),
      tempRoot: z.string().optional(),
      artifactsRoot: z.string().optional(),
    })
    .withMetadata({
      summary: "Disk-backed key-value blob storage under ~/.ecp",
      description:
        "Stores workflow media and values on disk. Default writes go to ~/.ecp/temp (wiped on ecp up). Opt into ~/.ecp/artifacts for durable retention. Browser calls hop to the host daemon.",
    })
    .withCapabilities(buildStorageCapabilities(handlers))
    .build()
}
