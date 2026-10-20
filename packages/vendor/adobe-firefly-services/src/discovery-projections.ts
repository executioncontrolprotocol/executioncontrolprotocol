import {
  parseCapabilityMetadata,
  type CapabilityMetadata,
  type CapabilityProjection,
} from "@executioncontrolprotocol/types"
import type { CapabilityDefinition } from "@executioncontrolprotocol/core"
import { EXT_ID } from "./shared.js"

/** Capability that materializes a PSD layer tree for author-time inspect. @category Adobe */
export const PHOTOSHOP_GENERATE_MANIFEST_ID =
  `${EXT_ID}.photoshop-generate-manifest` as const

type Overlay = {
  id: string
  description?: string
  extraUseCases?: string[]
  projections: CapabilityProjection[]
}

const GENERATE_MANIFEST_PROJECTIONS: CapabilityProjection[] = [
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

const OVERLAYS: Overlay[] = [
  {
    id: PHOTOSHOP_GENERATE_MANIFEST_ID,
    description:
      "Call this while authoring when the user has a Photoshop file and the next steps depend on its layers or size. The output can be large.",
    extraUseCases: ["Inspect a PSD before choosing which layer to edit"],
    projections: GENERATE_MANIFEST_PROJECTIONS,
  },
  {
    id: `${EXT_ID}.indesign-get-document-info`,
    extraUseCases: ["Inspect an InDesign document before merge or rendition"],
    projections: [
      {
        summary: "Read document structure",
        description:
          "Take pages, links, fonts, and text story facts you need before the next edit or export.",
      },
    ],
  },
  {
    id: `${EXT_ID}.indesign-data-merge-tags`,
    extraUseCases: ["Discover merge field names before a data merge"],
    projections: [
      {
        summary: "Take merge tag names",
        description: "Keep each data merge tag name so the CSV or mapping step can target the right fields.",
      },
    ],
  },
  {
    id: `${EXT_ID}.audio-video-template-describe`,
    extraUseCases: ["Inspect a video template before filling slots"],
    projections: [
      {
        summary: "Read template slots",
        description: "Take scene and slot identifiers and labels from the describe result for later fill steps.",
      },
    ],
  },
  {
    id: `${EXT_ID}.audio-video-voices`,
    projections: [
      {
        summary: "Choose a voice id",
        description: "Keep the voice id and display name for the narration or TTS step.",
      },
    ],
  },
  {
    id: `${EXT_ID}.audio-video-avatars`,
    projections: [
      {
        summary: "Choose an avatar id",
        description: "Keep the avatar id and display name for the avatar render step.",
      },
    ],
  },
  {
    id: `${EXT_ID}.audio-video-get-presets`,
    projections: [
      {
        summary: "Choose a preset id",
        description: "Keep the preset id and label for the generation or edit request.",
      },
    ],
  },
  {
    id: `${EXT_ID}.express-tagged-documents`,
    projections: [
      {
        summary: "Pick a tagged document",
        description: "Keep document ids and titles from the list for a details or export step.",
      },
    ],
  },
  {
    id: `${EXT_ID}.express-tagged-document-details`,
    projections: [
      {
        summary: "Read tagged fields",
        description: "Take tag names and values from the details result before editing or export.",
      },
    ],
  },
  {
    id: `${EXT_ID}.firefly-get-custom-models`,
    projections: [
      {
        summary: "Choose a custom model",
        description: "Keep the custom model id and name for a later Firefly generate call.",
      },
    ],
  },
  {
    id: `${EXT_ID}.substance3d-v1-scenes-describe`,
    extraUseCases: ["Inspect a Substance 3D scene before render or assemble"],
    projections: [
      {
        summary: "Read scene describe facts",
        description:
          "Take scene structure, asset names, and ids from the describe result before render or edit steps.",
      },
    ],
  },
]

/**
 * Merge richer plain-text projections onto inspect/list capabilities without editing generated shells.
 * @category Adobe
 */
export function withPhotoshopDiscoveryProjections(
  capabilities: CapabilityDefinition[]
): CapabilityDefinition[] {
  const byId = new Map(OVERLAYS.map((row) => [row.id, row]))
  return capabilities.map((capability) => {
    const overlay = byId.get(capability.id)
    if (!overlay) return capability
    const base = capability.metadata
    if (!base) return capability
    const useCases = [...(base.useCases ?? [])]
    for (const extra of overlay.extraUseCases ?? []) {
      if (!useCases.includes(extra)) useCases.push(extra)
    }
    const metadata = parseCapabilityMetadata({
      summary: base.summary,
      description: overlay.description ?? base.description,
      useCases,
      ...(base.label ? { label: base.label } : {}),
      projections: overlay.projections,
      ...(base._meta ? { _meta: base._meta } : {}),
    } satisfies CapabilityMetadata)
    return { ...capability, metadata }
  })
}
