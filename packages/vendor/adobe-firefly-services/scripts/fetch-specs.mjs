/**
 * Download Firefly Services OpenAPI specs into packages/adobe-firefly-services/openapi.
 * Usage: node packages/adobe-firefly-services/scripts/fetch-specs.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const openapiDir = join(root, "openapi")

/** @type {Record<string, string>} relative path under openapi/ → download URL */
export const SPEC_SOURCES = {
  "firefly/firefly-api.json":
    "https://raw.githubusercontent.com/AdobeDocs/ffs-firefly-api/main/static/firefly-api.json",
  "photoshop/photoshopv2-api.json":
    "https://raw.githubusercontent.com/AdobeDocs/ffs-photoshop-API/main/static/photoshopv2-api.json",
  "express/ffs-express-api.json":
    "https://raw.githubusercontent.com/AdobeDocs/ffs-express-api/main/static/ffs-express-api.json",
  "indesign/indesignapi.json":
    "https://raw.githubusercontent.com/AdobeDocs/ffs-indesign-API/main/static/indesignapi.json",
  "substance3d/openapi.yaml":
    "https://raw.githubusercontent.com/AdobeDocs/ffs-s3d-api/main/static/openapi/openapi.yaml",
  "illustrator/illustrator-api.json":
    "https://raw.githubusercontent.com/AdobeDocs/ffs-illustrator-API/main/static/illustrator-api.json",
  "illustrator/illustrator-api-beta.json":
    "https://raw.githubusercontent.com/AdobeDocs/ffs-illustrator-API/main/static/illustrator-api-beta.json",
  "creative-production/workflow-builder-api.yaml":
    "https://raw.githubusercontent.com/AdobeDocs/ffs-workflow-builder-api/main/static/workflow-builder-api.yaml",
  "audio-video/audio-video-api.json":
    "https://raw.githubusercontent.com/AdobeDocs/ffs-audio-video-API/main/static/openapi/audio-video-api.json",
  "audio-video/translate-lipsync-openapi.json":
    "https://raw.githubusercontent.com/AdobeDocs/ffs-translate-lipsync/main/static/openapi/openapi.json",
}

/**
 * Family id for a relative openapi path.
 * @param {string} rel
 */
export function familyForSpec(rel) {
  return rel.split("/")[0]
}

async function main() {
  for (const [rel, url] of Object.entries(SPEC_SOURCES)) {
    const dest = join(openapiDir, rel)
    mkdirSync(dirname(dest), { recursive: true })
    process.stdout.write(`Fetching ${rel}… `)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`)
    const body = await res.text()
    writeFileSync(dest, body, "utf8")
    console.log(`${body.length} bytes`)
  }

  const ctNote = join(openapiDir, "content-tagging", "SOURCE.md")
  mkdirSync(dirname(ctNote), { recursive: true })
  writeFileSync(
    ctNote,
    `# Content Tagging

Adobe Firefly Services guides link Content Tagging to Experience League
[Content Commerce AI / Intelligent Services](https://experienceleague.adobe.com/docs/experience-platform/intelligent-services/content-commerce-ai/overview.html),
not a downloadable Firefly Services OpenAPI spoke under AdobeDocs \`ffs-*\`.

Document tagging for Express automation is covered by the \`express\` family
(\`ffs-express-api.json\` tagged-documents endpoints).

No \`content-tagging\` capabilities are generated until Adobe publishes an FFS OpenAPI.
`,
    "utf8",
  )
  console.log("Wrote content-tagging/SOURCE.md")
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("fetch-specs.mjs")) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
