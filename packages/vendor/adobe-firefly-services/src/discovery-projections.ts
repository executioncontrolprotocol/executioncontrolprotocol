import {
  parseCapabilityMetadata,
  type CapabilityMetadata,
} from "@executioncontrolprotocol/types"
import type { CapabilityDefinition } from "@executioncontrolprotocol/core"
import { EXT_ID } from "./shared.js"

/** Capability that materializes a PSD layer tree for author-time inspect. @category Adobe */
export const PHOTOSHOP_GENERATE_MANIFEST_ID =
  `${EXT_ID}.photoshop-generate-manifest` as const

const GENERATE_MANIFEST_PROJECTIONS: NonNullable<CapabilityMetadata["projections"]> = [
  {
    summary: "Retrieve all visible layers",
    description:
      "Look through the document layers and keep each one whose visible field is true. Use the layer id and name.",
  },
  {
    summary: "Read the image size",
    description: "Read width and height from the top of the result.",
  },
]

/**
 * Merge plain-text projections onto photoshop-generate-manifest without editing generated shells.
 * @category Adobe
 */
export function withPhotoshopDiscoveryProjections(
  capabilities: CapabilityDefinition[]
): CapabilityDefinition[] {
  return capabilities.map((capability) => {
    if (capability.id !== PHOTOSHOP_GENERATE_MANIFEST_ID) return capability
    const base = capability.metadata
    if (!base) return capability
    const metadata = parseCapabilityMetadata({
      summary: base.summary,
      description:
        "Call this while authoring when the user has a Photoshop file and the next steps depend on its layers or size. The output can be large.",
      useCases: [
        ...(base.useCases ?? []),
        "Inspect a PSD before choosing which layer to edit",
      ],
      ...(base.label ? { label: base.label } : {}),
      projections: GENERATE_MANIFEST_PROJECTIONS,
      ...(base._meta ? { _meta: base._meta } : {}),
    })
    return { ...capability, metadata }
  })
}
