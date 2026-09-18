import {
  defineExtension,
  capabilityFor,
  type CapabilityDefinition,
  type CapabilityHandler,
  type ExtensionDefinition,
} from "@executioncontrolprotocol/core"
import { z } from "zod"
import {
  storageReadInputSchema,
  storageReadOutputSchema,
  storageWriteInputSchema,
  storageWriteOutputSchema,
  workflowDeleteInputSchema,
  workflowDeleteOutputSchema,
  workflowListInputSchema,
  workflowListOutputSchema,
  workflowLoadInputSchema,
  workflowLoadOutputSchema,
  workflowSaveInputSchema,
  workflowSaveOutputSchema,
} from "./schemas.js"

/** Extension id. @category Storage */
export const EXT_ID = "@executioncontrolprotocol/storage"

/** Message when browser catalog handlers are invoked without a host hop. @category Storage */
export const HOST_HOP_MESSAGE =
  "Storage read/write require a host runtime (ecp up). Pair the browser demo with the local daemon."

/** Handlers for storage capabilities. @category Storage */
export interface StorageCapabilityHandlers {
  write: CapabilityHandler
  read: CapabilityHandler
  workflowSave: CapabilityHandler
  workflowList: CapabilityHandler
  workflowLoad: CapabilityHandler
  workflowDelete: CapabilityHandler
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
    capabilityFor(EXT_ID, "workflow-save")
      .withInput(workflowSaveInputSchema)
      .withOutput(workflowSaveOutputSchema)
      .withExecution("host")
      .withMetadata({
        summary: "Save Fluent workflow source under ~/.ecp/workflows",
        description:
          "Persists Fluent TypeScript (`.workflow.ts`) to disk so it survives ecp up restarts. Open compiles it back into the editor.",
        useCases: [
          "Save the current browser-demo workflow to the local host library",
          "Overwrite an existing saved workflow by id",
        ],
        samplePrompts: [
          "Save this workflow as my-recolor-flow",
          "Persist the current Fluent workflow to disk",
        ],
      })
      .withHandler(handlers.workflowSave),
    capabilityFor(EXT_ID, "workflow-list")
      .withInput(workflowListInputSchema)
      .withOutput(workflowListOutputSchema)
      .withExecution("host")
      .withMetadata({
        summary: "List saved workflows",
        description:
          "Returns id, label, and updatedAt for each Fluent (or legacy bundle) file under ~/.ecp/workflows.",
        useCases: [
          "Populate an Open recent workflows menu in the browser demo",
          "Discover workflows saved on this machine",
        ],
        samplePrompts: [
          "List saved workflows on the host",
          "Show my local ECP workflow library",
        ],
      })
      .withHandler(handlers.workflowList),
    capabilityFor(EXT_ID, "workflow-load")
      .withInput(workflowLoadInputSchema)
      .withOutput(workflowLoadOutputSchema)
      .withExecution("host")
      .withMetadata({
        summary: "Load a saved Fluent workflow by id",
        description:
          "Reads Fluent source from ~/.ecp/workflows (or unwraps a legacy dual-bundle JSON).",
        useCases: [
          "Reload a previously saved workflow into the editor",
          "Restore Fluent and canvas from host disk",
        ],
        samplePrompts: [
          "Load the workflow named my-recolor-flow",
          "Open the saved workflow by id",
        ],
      })
      .withHandler(handlers.workflowLoad),
    capabilityFor(EXT_ID, "workflow-delete")
      .withInput(workflowDeleteInputSchema)
      .withOutput(workflowDeleteOutputSchema)
      .withExecution("host")
      .withMetadata({
        summary: "Delete a saved workflow by id",
        description: "Removes Fluent and/or legacy bundle files from ~/.ecp/workflows.",
        useCases: [
          "Remove an obsolete saved workflow from the local library",
          "Clean up a misnamed save",
        ],
        samplePrompts: [
          "Delete the saved workflow my-recolor-flow",
          "Remove this workflow from host storage",
        ],
      })
      .withHandler(handlers.workflowDelete),
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
      workflowsRoot: z.string().optional(),
    })
    .withMetadata({
      summary: "Disk-backed blob and workflow storage under ~/.ecp",
      description:
        "Stores media under temp/artifacts and Fluent workflows (`.workflow.ts`) under ~/.ecp/workflows. Temp is wiped on ecp up; workflows and durable artifacts survive. Browser calls hop to the host daemon.",
    })
    .withCapabilities(buildStorageCapabilities(handlers))
    .build()
}
