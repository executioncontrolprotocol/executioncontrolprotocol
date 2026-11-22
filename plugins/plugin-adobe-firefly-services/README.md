# `@executioncontrolprotocol/adobe-firefly-services`

Adobe Firefly Services APIs as ECP capabilities, generated from vendored OpenAPI specs under
`openapi/`. **63** capabilities ship across eight families (`content-tagging` is skipped — no
published Firefly Services OpenAPI).

**Entrypoints:** `src/index.ts`, `ecp.manifest.json`, `ecp.schema.json`

Used by the A10 localize-banner dogfood (`examples/localize-banner/`).

## Request limit

If your credentials allow only so many requests per minute, set `maxRequestsPerMinute` on the config. The plugin
then spaces job submissions and other non-GET requests (including a retry after HTTP 429) evenly, shared by every
step and run in the host that uses the same client id, endpoint and limit, so concurrent `forEach` items draw on
one budget. Job status polls (GET) are not counted; `pollIntervalMs` sets their pace.

```json
{
  "schema": "@executioncontrolprotocol.config",
  "version": "1.0",
  "id": "adobe-firefly-services/default",
  "plugin": "@executioncontrolprotocol/adobe-firefly-services",
  "values": {
    "clientId": { "$secret": "adobe-firefly-services/client-id" },
    "clientSecret": { "$secret": "adobe-firefly-services/client-secret" },
    "maxRequestsPerMinute": 4
  }
}
```

## Capabilities by family

### audio-video (14)

- audio-video-avatars
- audio-video-dub
- audio-video-dub-translate-lipsync
- audio-video-generate-avatar
- audio-video-generate-reframed-video
- audio-video-generate-reframed-video-v2
- audio-video-generate-speech
- audio-video-get-presets
- audio-video-list-render-jobs
- audio-video-template-describe
- audio-video-template-render
- audio-video-transcribe
- audio-video-transcribe-translate-lipsync
- audio-video-voices

### creative-production (3)

- creative-production-batch-execute
- creative-production-list-batch-executions
- creative-production-list-batches

### express (4)

- express-export-rendition
- express-generate-variation
- express-tagged-document-details
- express-tagged-documents

### firefly (11)

- firefly-adaptive-composite
- firefly-expand-images-v3-async
- firefly-fill-images-v3-async
- firefly-generate-images-v3-async
- firefly-generate-images-v5-async
- firefly-generate-object-composite-v3-async
- firefly-generate-similar-images-v3-async
- firefly-generate-video-v3
- firefly-get-custom-models
- firefly-precise-composite
- firefly-precise-upsampler-v3-async

### illustrator (4)

- illustrator-create-rendition
- illustrator-data-merge
- illustrator-execute-custom-script-capability
- illustrator-trace-image

### indesign (12)

- indesign-convert-pdfto-in-design
- indesign-data-merge
- indesign-data-merge-tags
- indesign-delete-custom-script
- indesign-execute-custom-script
- indesign-get-custom-script-details
- indesign-get-document-info
- indesign-list-app-versions
- indesign-list-custom-scripts
- indesign-remap-links
- indesign-rendition-job
- indesign-update-script-app-version

### photoshop (6)

- photoshop-actions
- photoshop-auto-crop
- photoshop-create-artboard
- photoshop-create-composite
- photoshop-edit
- photoshop-generate-manifest

### substance3d (9)

- substance3d-create-space-from-frame-io-v2
- substance3d-create-space-from-next-frame-io-v2
- substance3d-create-space-url-v2
- substance3d-v1-composites-compose
- substance3d-v1-scenes-assemble
- substance3d-v1-scenes-convert
- substance3d-v1-scenes-describe
- substance3d-v1-scenes-render
- substance3d-v1-scenes-render-basic

## Regeneration

```sh
pnpm run build   # generate + tsc + ecp-plugin-manifest
```

Live integration tests need Adobe IMS credentials in the plugin config; they skip when unset.
