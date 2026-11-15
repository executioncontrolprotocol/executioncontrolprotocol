/**
 * Vendored Firefly Services OpenAPI specs: relative path under `openapi/` -> upstream URL.
 * @type {Record<string, string>}
 */
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
 * Family id for a relative openapi path (its first segment).
 * @param {string} rel
 */
export function familyForSpec(rel) {
  return rel.split("/")[0]
}
