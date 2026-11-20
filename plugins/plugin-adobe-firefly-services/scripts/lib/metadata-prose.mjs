/**
 * Agent-facing capability summaries, use cases, and validation for Firefly Services codegen.
 *
 * @category Generated
 */

/** OpenAPI file plus operationId remaps when the same operationId appears in multiple specs. */
export const OPERATION_SPEC_ID_REMAP = {
  "audio-video/translate-lipsync-openapi.json:dub": "dub-translate-lipsync",
  "audio-video/translate-lipsync-openapi.json:transcribe": "transcribe-translate-lipsync",
}

/**
 * OpenAPI summaries that do not describe the task; replaced using {@link SUMMARY_PHRASE_BY_NAME}.
 */
const VAGUE_OPENAPI_SUMMARIES = new Set([
  "submit a job",
  "tagged documents",
  "tagged document details",
  "data merge",
  "list custom scripts api",
  "get current app versions",
  "get custom script details",
  "delete a custom script",
  "update custom script app version",
  "create space from frame io api",
  "create space from next frame io api",
  "create space from url api",
])

/**
 * Sentence-case agent summary phrase (without the Adobe family suffix).
 *
 * @type {Record<string, string>}
 */
const SUMMARY_PHRASE_BY_NAME = {
  "audio-video-dub": "Dub audio or video with optional lip-sync compositing",
  "audio-video-dub-translate-lipsync":
    "Dub audio or video (translate and lip-sync OpenAPI spec, same endpoint as consolidated API)",
  "audio-video-transcribe": "Transcribe audio or video with captions in source or target languages",
  "audio-video-transcribe-translate-lipsync":
    "Transcribe audio or video to text (translate and lip-sync OpenAPI spec, transcripts only in this bundle)",
  "audio-video-generate-reframed-video": "Reframe video with the legacy v1 API (prefer v2 when possible)",
  "express-tagged-documents": "List Express documents available for bulk automation",
  "express-tagged-document-details": "Get tagged pages and elements inside one Express document",
  "illustrator-trace-image": "Convert a raster image to vector SVG",
  "illustrator-data-merge": "Merge CSV data into an Illustrator template",
  "illustrator-execute-custom-script-capability": "Run a registered Illustrator cloud custom script",
  "indesign-execute-custom-script": "Run a registered InDesign cloud custom script",
  "indesign-list-custom-scripts": "List registered InDesign custom scripts",
  "indesign-list-app-versions": "List supported InDesign app versions for custom scripts",
  "indesign-get-custom-script-details": "Get metadata for one InDesign custom script",
  "indesign-delete-custom-script": "Delete an InDesign custom script registration",
  "indesign-update-script-app-version": "Set the InDesign app version a custom script targets",
  "substance3d-create-space-from-frame-io-v2": "Create a 3D asset space from a Frame.io folder",
  "substance3d-create-space-from-next-frame-io-v2": "Create a 3D asset space from a Next Frame.io folder",
  "substance3d-create-space-url-v2": "Create a 3D asset space from file URLs",
  "firefly-expand-images-v3-async": "Expand image borders to a new size or aspect ratio",
  "firefly-precise-upsampler-v3-async": "Upscale an image with the precise upsampler",
  "firefly-generate-images-v5-async": "Generate images with Image5",
  "indesign-rendition-job": "Create JPEG, PNG, or PDF renditions",
}

/** First words accepted as verb-led summaries for generator tests. */
export const SUMMARY_VERB_PATTERN =
  /^(get|list|fetch|retrieve|generate|create|export|render|describe|convert|delete|update|submit|execute|perform|remap|run|expand|fill|upscale|reframe|transcribe|dub|auto|edit|trace|merge|replace|obtain|synthesize|discover|inspect|audit|change|extend|set|upload|choose|pick|read)/i

/**
 * Hand-written prose merged over derived metadata.
 *
 * @type {Record<string, { summary?: string, description?: string, useCases?: string[], projections?: string[] }>}
 */
export const METADATA_OVERRIDES = {
  "photoshop-actions": {
    summary: "Run Photoshop actions or a UXP script on a document.",
    description:
      "Runs Photoshop actions (.atn files or inline actionJSON) or a UXP script against an input image or PSD and writes the requested outputs. Pass a UXP script inline as the string field options.uxp.source.content (executions supply it with $script; Adobe caps inline content at 50 KB) or reference a hosted script by URL. Outputs go to the destinations you list, such as presigned storage URLs. The step submits the job, waits for it to finish and returns the job result.",
    useCases: [
      "Edit text layers, swap images or apply adjustments in a PSD with a UXP script",
      "Replay a recorded Photoshop action set over an image",
    ],
  },
  "audio-video-avatars": {
    useCases: ["Choose an avatar id before generating a talking-head video"],
  },
  "audio-video-dub": {
    useCases: ["Replace dialogue with a dubbed track in a new language, with optional lip sync on video"],
  },
  "audio-video-dub-translate-lipsync": {
    useCases: [
      "Dub media when integrations still target the standalone translate-and-lip-sync OpenAPI document",
    ],
  },
  "audio-video-generate-avatar": {
    useCases: ["Create a presenter video from a transcript or audio file"],
  },
  "audio-video-generate-reframed-video": {
    useCases: ["Reframe clips when only the older reframe endpoint is available"],
  },
  "audio-video-generate-reframed-video-v2": {
    useCases: ["Change video aspect ratio or framing with the current reframe API"],
  },
  "audio-video-generate-speech": {
    useCases: ["Synthesize voice audio from text for narration or dubbing pipelines"],
  },
  "audio-video-get-presets": {
    useCases: ["Discover template rendering presets before starting a render job"],
  },
  "audio-video-list-render-jobs": {
    useCases: ["Audit or track in-flight template video render jobs"],
  },
  "audio-video-template-describe": {
    useCases: ["Inspect a motion graphic template structure before filling it with data"],
  },
  "audio-video-template-render": {
    useCases: ["Render a finished video from a creative template with your parameters"],
  },
  "audio-video-transcribe": {
    useCases: [
      "Produce transcripts and timed captions from source or translated audio or video",
    ],
  },
  "audio-video-transcribe-translate-lipsync": {
    useCases: [
      "Transcribe media when tooling still references the standalone translate-and-lip-sync OpenAPI bundle",
    ],
  },
  "audio-video-voices": {
    useCases: ["Pick a voice profile before calling text-to-speech"],
  },
  "creative-production-batch-execute": {
    useCases: ["Run many assets through the same creative workflow in one batch job"],
  },
  "creative-production-list-batch-executions": {
    useCases: ["Inspect per-asset outcomes after a batch workflow run"],
  },
  "creative-production-list-batches": {
    useCases: ["Find earlier workflow batch jobs to monitor or compare"],
  },
  "express-export-rendition": {
    useCases: ["Export an Express design to PNG, PDF or other renditions for downstream channels"],
  },
  "express-generate-variation": {
    useCases: ["Produce alternate layouts from an Express template for bulk creative"],
  },
  "express-tagged-documents": {
    useCases: ["Find Express documents that expose tagged fields for automation"],
  },
  "express-tagged-document-details": {
    useCases: ["Read tagged element positions and page structure before bulk generation"],
  },
  "firefly-adaptive-composite": {
    useCases: ["Place a product or object into a scene with lighting-aware compositing"],
  },
  "firefly-expand-images-v3-async": {
    useCases: ["Extend an image past its borders to a new aspect ratio or larger canvas"],
  },
  "firefly-fill-images-v3-async": {
    useCases: ["Inpaint or extend masked regions of an image from a text prompt"],
  },
  "firefly-generate-images-v3-async": {
    useCases: ["Create images from a prompt with optional style or structure references"],
  },
  "firefly-generate-images-v5-async": {
    useCases: ["Generate images with the Image5 model and reference blobs"],
  },
  "firefly-generate-object-composite-v3-async": {
    useCases: ["Composite a cut-out object onto a background image"],
  },
  "firefly-generate-similar-images-v3-async": {
    useCases: ["Derive new images that resemble a reference photo"],
  },
  "firefly-generate-video-v3": {
    useCases: ["Generate a short video clip from a text or image prompt"],
  },
  "firefly-get-custom-models": {
    useCases: ["List custom Firefly models available to the organization"],
  },
  "firefly-precise-composite": {
    useCases: ["Blend a foreground object into a background with precise placement control"],
  },
  "firefly-precise-upsampler-v3-async": {
    useCases: ["Increase resolution while preserving detail on an existing image"],
  },
  "illustrator-create-rendition": {
    useCases: ["Export Illustrator artwork to PNG, PDF or other formats from cloud storage URLs"],
  },
  "illustrator-data-merge": {
    useCases: ["Personalize Illustrator templates with rows from a CSV dataset"],
  },
  "illustrator-execute-custom-script-capability": {
    useCases: ["Automate Illustrator with a capability script stored in the cloud"],
  },
  "illustrator-trace-image": {
    useCases: ["Vectorize a PNG or JPEG logo or illustration for scalable output"],
  },
  "indesign-convert-pdfto-in-design": {
    useCases: ["Turn a PDF into an editable InDesign document"],
  },
  "indesign-data-merge": {
    useCases: ["Produce personalized InDesign layouts from a data source"],
  },
  "indesign-data-merge-tags": {
    useCases: ["Discover merge fields in an InDesign template before running data merge"],
  },
  "indesign-delete-custom-script": {
    useCases: ["Remove a custom script registration that is no longer needed"],
  },
  "indesign-execute-custom-script": {
    useCases: ["Automate layout or export steps with a hosted InDesign script"],
  },
  "indesign-get-custom-script-details": {
    useCases: ["Verify script metadata before executing or updating it"],
  },
  "indesign-get-document-info": {
    useCases: ["Read page and layer facts from an InDesign document without downloading the full file"],
  },
  "indesign-list-app-versions": {
    useCases: ["Check which InDesign versions a script must support"],
  },
  "indesign-list-custom-scripts": {
    useCases: ["Enumerate scripts registered for server-side InDesign automation"],
  },
  "indesign-remap-links": {
    useCases: ["Relink placed assets in an InDesign package to new URLs"],
  },
  "indesign-rendition-job": {
    useCases: ["Render InDesign pages to JPEG, PNG or PDF renditions"],
  },
  "indesign-update-script-app-version": {
    useCases: ["Retarget a stored script to a newer InDesign server version"],
  },
  "photoshop-auto-crop": {
    useCases: ["Trim transparent or solid borders from a product or packshot image"],
  },
  "photoshop-create-artboard": {
    useCases: ["Build a new artboard layout from structured layer JSON"],
  },
  "photoshop-create-composite": {
    useCases: ["Assemble layered composites from Smart Object definitions"],
  },
  "photoshop-edit": {
    useCases: ["Apply adjustment or retouch operations defined in Photoshop JSON"],
  },
  "photoshop-generate-manifest": {
    useCases: ["Extract layer and text metadata from a PSD for templating workflows"],
    projections: ["Read `layers` and `document` from the manifest object (width, height from document bounds; layer names, types, ids and nested children)."],
  },
  "firefly-generate-images-v3-async": {
    useCases: ["Create images from a prompt with optional style or structure references"],
    projections: ["Bind `images.0` (url FileRef) or pass seeds into a later edit; each ref carries `mediaType`."],
  },
  "firefly-generate-images-v5-async": {
    useCases: ["Generate images with the Image5 model and reference blobs"],
    projections: ["Bind `images.0` (url FileRef) into Photoshop composite or download steps."],
  },
  "photoshop-create-composite": {
    useCases: ["Assemble layered composites from Smart Object definitions"],
    projections: ["Bind `png` and `psd` FileRefs (or other tokens matching your requested `outputs[].mediaType`)."],
  },
  "substance3d-create-space-from-frame-io-v2": {
    useCases: ["Stage Frame.io folders as a Substance space for later 3D jobs"],
    projections: ["Keep the new space id so later 3D steps can reference uploaded Frame.io assets."],
  },
  "substance3d-create-space-from-next-frame-io-v2": {
    useCases: ["Stage Next Frame.io folders as a Substance space for later 3D jobs"],
    projections: ["Keep the new space id so later 3D steps can reference uploaded Next Frame.io assets."],
  },
  "substance3d-create-space-url-v2": {
    useCases: ["Stage remote files by URL into a Substance space before scene work"],
    projections: ["Keep the new space id so later 3D steps can reference files staged by URL."],
  },
  "substance3d-v1-composites-compose": {
    useCases: ["Place a 3D product render into a 2D marketing composite"],
  },
  "substance3d-v1-scenes-assemble": {
    useCases: ["Build a 3D scene from Substance materials and meshes"],
  },
  "substance3d-v1-scenes-convert": {
    useCases: ["Convert between 3D interchange formats in the cloud"],
  },
  "substance3d-v1-scenes-describe": {
    useCases: ["Summarize scene contents before rendering or editing"],
  },
  "substance3d-v1-scenes-render": {
    useCases: ["Render a high-quality image from an assembled 3D scene"],
  },
  "substance3d-v1-scenes-render-basic": {
    useCases: ["Quick preview render when full-quality output is not needed"],
  },
}

/**
 * @param {string} text
 */
/** Product and service names that keep their capital in sentence-case summaries. */
const PROPER_NOUNS = new Set(["Adobe", "Express", "Firefly", "Illustrator", "Photoshop", "Substance", "Image5"])

function toSentenceCasePhrase(text) {
  const trimmed = text.replace(/\s+/g, " ").trim()
  if (!trimmed) return ""
  const words = trimmed.split(" ")
  const first = words[0].toLowerCase()
  // Lower only plain Title-case words; keep acronyms, mixed case (InDesign) and product names.
  const rest = words
    .slice(1)
    .map((w) => (/^[A-Z][a-z]+$/.test(w) && !PROPER_NOUNS.has(w) ? w.toLowerCase() : w))
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(" ").replace(/\s+API\s*$/i, "")
}

/**
 * Agent summary phrase before the Adobe family suffix is applied.
 *
 * @param {any} operation
 * @param {string} name
 * @param {(text: unknown, max?: number) => string} cleanDescription
 */
export function formatSummaryPhrase(operation, name, cleanDescription) {
  if (SUMMARY_PHRASE_BY_NAME[name]) return SUMMARY_PHRASE_BY_NAME[name]
  const raw = cleanDescription(operation.summary ?? "", 160)
  const rawLower = raw.toLowerCase().replace(/\.$/, "")
  if (raw && !VAGUE_OPENAPI_SUMMARIES.has(rawLower)) {
    return toSentenceCasePhrase(raw.replace(/\.$/, ""))
  }
  const desc = cleanDescription(operation.description ?? "", 300)
  const allows = desc.match(/allows you to ([^.]+)/i)
  if (allows?.[1]) return toSentenceCasePhrase(allows[1])
  const enables = desc.match(/enables you to ([^.]+)/i)
  if (enables?.[1]) return toSentenceCasePhrase(enables[1])
  if (desc.match(/^this api retrieves a list/i)) {
  return "List resources returned by the API"
  }
  if (desc.match(/^this api retrieves details/i)) {
    return "Get detailed resource metadata"
  }
  if (desc.match(/^generates? /i)) {
    return toSentenceCasePhrase(desc.split(/[.!?]/)[0])
  }
  return toSentenceCasePhrase(raw || name.replace(/^[a-z]+-/, "").replace(/-/g, " "))
}

/**
 * @param {any} operation
 * @param {string} name
 * @param {string} label
 * @param {string} summaryPhrase
 */
export function deriveDefaultUseCases(operation, name, label, summaryPhrase) {
  const desc = cleanDescription(operation.description ?? "", 200)
  if (/reframe.*v2/i.test(desc) && name.includes("reframe-video-v2")) {
    return ["Change video aspect ratio or framing with the current reframe API"]
  }
  const firstSentence = desc.split(/(?<=[.!?])\s+/)[0]?.replace(/\.$/, "")
  if (firstSentence && firstSentence.length > 20 && firstSentence.length < 120) {
    let goal = firstSentence
    goal = goal.replace(/^this endpoint (allows|enables) you to /i, "")
    goal = goal.replace(/^this api /i, "")
    goal = goal.replace(/^generates? /i, "Generate ")
    if (!goal.includes(summaryPhrase) && goal.length > 15) {
      return [goal.charAt(0).toUpperCase() + goal.slice(1)]
    }
  }
  throw new Error(`Missing use case override for capability ${name}`)
}

/**
 * @param {string} text
 * @param {number} [max]
 */
function cleanDescription(text, max) {
  const plain = String(text ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!max || plain.length <= max) return plain
  const cut = plain.slice(0, max - 3)
  const lastSpace = cut.lastIndexOf(" ")
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim()}...`
}

/**
 * @param {{ name: string, summary: string, useCases: string[] }[]} capabilities
 */
export function assertAgentMetadata(capabilities) {
  /** @type {Map<string, string>} */
  const bySummary = new Map()
  const issues = []
  for (const cap of capabilities) {
    const core = cap.summary.replace(/\s*\(Adobe [^)]+\)\.\s*$/, "").replace(/\.$/, "")
    const prior = bySummary.get(core)
    if (prior) issues.push(`duplicate summary ${JSON.stringify(core)} on ${prior} and ${cap.name}`)
    else bySummary.set(core, cap.name)

    const verbTarget = core.includes(" (Adobe ") ? core.split(" (Adobe ")[0] : core
    const first = verbTarget.split(/\s+/)[0] ?? ""
    if (!SUMMARY_VERB_PATTERN.test(first)) {
      issues.push(`${cap.name}: summary does not start with a verb (${JSON.stringify(first)})`)
    }
    for (const uc of cap.useCases) {
      if (uc.includes(core) || (cap.summary && uc.includes(cap.summary))) {
        issues.push(`${cap.name}: use case restates summary verbatim`)
      }
      if (/when the goal is to/i.test(uc)) {
        issues.push(`${cap.name}: use case uses retired template`)
      }
    }
  }
  if (issues.length) throw new Error(`Agent metadata checks failed:\n${issues.join("\n")}`)
}