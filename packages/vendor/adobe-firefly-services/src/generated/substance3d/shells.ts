/* eslint-disable */
/** Generated Adobe substance3d capability shells — do not edit. */
import { capabilityFor, type CapabilityHandler } from "@executioncontrolprotocol/core"
import { z } from "zod"
import * as schemas from "./schemas.js"

const EXT_ID = "@executioncontrolprotocol/adobe-firefly-services"

/** Generate 3D object composite */
export function substance3d_v1_composites_compose(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "substance3d-v1-composites-compose")
    .withInput(z.object({
  query: z.object({
  "wait": z.boolean().optional()
}).optional(),
  headers: z.object({
  "X-User-Token": z.string().optional()
}).optional(),
  body: schemas.Schema_restv1_ComposeSceneRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_restv1beta_ComposeSceneResponse)
    .withMetadata({"summary":"Generate 3D object composite","description":"Generate a 3D Object Composite with the Substance 3D API.","useCases":["Substance3d Composites tasks that need this operation","When the workflow goal is to generate 3D object composite"],"samplePrompts":["Generate 3D object composite","Generate 3D object composite with Adobe Substance3d"]})
    .withHandler(handler)
}

/** Create 3D scene */
export function substance3d_v1_scenes_assemble(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "substance3d-v1-scenes-assemble")
    .withInput(z.object({
  query: z.object({
  "wait": z.boolean().optional()
}).optional(),
  body: schemas.Schema_restv1beta_CreateSceneRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_restv1beta_CreateSceneResponse)
    .withMetadata({"summary":"Create 3D scene","description":"Assemble a 3D scene with the Substance 3D API.","useCases":["Substance3d Scenes tasks that need this operation","When the workflow goal is to create 3D scene"],"samplePrompts":["Create 3D scene","Create 3D scene with Adobe Substance3d"]})
    .withHandler(handler)
}

/** Convert 3D files */
export function substance3d_v1_scenes_convert(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "substance3d-v1-scenes-convert")
    .withInput(z.object({
  query: z.object({
  "wait": z.boolean().optional()
}).optional(),
  body: schemas.Schema_restv1beta_ModelConvertRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_restv1beta_ModelConvertResponse)
    .withMetadata({"summary":"Convert 3D files","description":"Convert a 3D file into another 3D format with the Substance 3D API.","useCases":["Substance3d Scenes tasks that need this operation","When the workflow goal is to convert 3D files"],"samplePrompts":["Convert 3D files","Convert 3D files with Adobe Substance3d"]})
    .withHandler(handler)
}

/** Describe 3D scene */
export function substance3d_v1_scenes_describe(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "substance3d-v1-scenes-describe")
    .withInput(z.object({
  query: z.object({
  "wait": z.boolean().optional()
}).optional(),
  body: schemas.Schema_restv1beta_SceneDescRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_restv1beta_SceneDescResponse)
    .withMetadata({"summary":"Describe 3D scene","description":"Describe a 3D scene.","useCases":["Substance3d Scenes tasks that need this operation","When the workflow goal is to describe 3D scene"],"samplePrompts":["Describe 3D scene","Describe 3D scene with Adobe Substance3d"]})
    .withHandler(handler)
}

/** Render 3D object */
export function substance3d_v1_scenes_render(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "substance3d-v1-scenes-render")
    .withInput(z.object({
  query: z.object({
  "wait": z.boolean().optional()
}).optional(),
  body: schemas.Schema_restv1beta_RenderSceneRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_restv1beta_RenderSceneResponse)
    .withMetadata({"summary":"Render 3D object","description":"Render a 3D object with the Substance 3D API.","useCases":["Substance3d Scenes tasks that need this operation","When the workflow goal is to render 3D object"],"samplePrompts":["Render 3D object","Render 3D object with Adobe Substance3d"]})
    .withHandler(handler)
}

/** Render 3D object (basic version) */
export function substance3d_v1_scenes_render_basic(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "substance3d-v1-scenes-render-basic")
    .withInput(z.object({
  query: z.object({
  "wait": z.boolean().optional()
}).optional(),
  body: schemas.Schema_restv1beta_RenderModelRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_restv1beta_RenderModelResponse)
    .withMetadata({"summary":"Render 3D object (basic version)","description":"Render a 3D object (basic version) with the Substance 3D API.","useCases":["Substance3d Scenes tasks that need this operation","When the workflow goal is to render 3D object (basic version)"],"samplePrompts":["Render 3D object (basic version)","Render 3D object (basic version) with Adobe Substance3d"]})
    .withHandler(handler)
}

/** Create Space */
export function substance3d_create_space_v1(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "substance3d-create-space-v1")
    .withInput(z.object({}))
    .withOutput(schemas.Schema_rest_base_Space)
    .withMetadata({"summary":"Create Space","description":"Create a Space from 3D files.","useCases":["Substance3d Spaces tasks that need this operation","When the workflow goal is to create Space"],"samplePrompts":["Create Space","Create Space with Adobe Substance3d"]})
    .withHandler(handler)
}

/** Create Space API */
export function substance3d_create_space_v2(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "substance3d-create-space-v2")
    .withInput(z.object({}))
    .withOutput(schemas.Schema_rest_base_Space)
    .withMetadata({"summary":"Create Space API","description":"## Overview The **Substance 3D API** provides a way to upload and temporarily store files. Uploading files requires a **multipart/form-data** request to send data. The request requires a **files** field containing a list of files. Each file's **filename** field can contain a filepath to specify where the file will be stored in the space. Example for this files tree: ``` ├── textures │ ├── diffuse.png │ └── normal.png └── lighthouse.fbx ``` HTTP data relative to the previous files tree: ```HTTP POST /spaces HTTP/1.1 Host: localhost:8080 Content-Type: multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW ------WebKitFormBoundary7MA4YWxkTrZu0gW Content-Disposition: form-data; name=\"files\"; filename=\"lighthouse.fbx\" Content-Type: model/vnd.autodesk.fbx (data) ------WebKitFormBoundary7MA4YWxkTrZu0gW Content-Disposition: form-data; name=\"files\"; filename=\"textures/diffuse.png\" Content-Type: image/png (data) ------WebKitFormBoundary7MA4YWxkTrZu0gW Content-Disposition: form-data; name=\"files\"; filename=\"textures/normal.png\" Content-Type: image/png (data) ------WebKitFormBoundary7MA4YWxkTrZu0gW-- ``` Curl command to create this file tree: ``` curl -X POST https://s3d.adobe.io/v2/spaces \\ -F \"files=@Local/Path/To/The/Local/File/lighthouse.fbx;filename=lighthouse.fbx\" \\ -F \"files=@Local/Path/To/The/Local/File/diffuse.png;filename=textures/diffuse.png\" \\ -F \"files=@Local/Path/To/The/Local/File/normal.png;filename=textures/normal.png\" ``` The result of the post is a **JSON** which contained the **id** of the space created. Space **id** can be used into a space source to use space content as a source for API operations. Example of a space source: ```json { \"space\": { \"id\": \"\" } } ```","useCases":["When the workflow goal is to create Space API"],"samplePrompts":["Create Space API","Create Space API with Adobe Substance3d"]})
    .withHandler(handler)
}

/** Create Space From Frame IO API */
export function substance3d_create_space_from_frame_io_v2(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "substance3d-create-space-from-frame-io-v2")
    .withInput(z.object({
  body: schemas.Schema_rest_base_FileFrameIO
}))
    .withOutput(schemas.Schema_rest_base_Space)
    .withMetadata({"summary":"Create Space From Frame IO API","description":"## Overview The **Substance 3D API** provides a way to upload and temporary store files. You can upload folders from **frame.io** to create a space. To upload a folder from frame.io, you must pass the following parameters: - **access Token** - **folder ID** The result of the post is a **JSON** which contained the **id** of the space created. Space **id** can be used into a space source to use space content as a source for API operations. Example of a space source: ```json { \"space\": { \"id\": \"\" } } ```","useCases":["When the workflow goal is to create Space From Frame IO API"],"samplePrompts":["Create Space From Frame IO API","Create Space From Frame IO API with Adobe Substance3d"]})
    .withHandler(handler)
}

/** Create Space From Next Frame IO API */
export function substance3d_create_space_from_next_frame_io_v2(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "substance3d-create-space-from-next-frame-io-v2")
    .withInput(z.object({
  body: schemas.Schema_rest_base_FileNextFrameIO
}))
    .withOutput(schemas.Schema_rest_base_Space)
    .withMetadata({"summary":"Create Space From Next Frame IO API","description":"## Overview The **Substance 3D API** provides a way to upload and temporary store files. You can upload folders from **next.frame.io** to create a space. To upload a folder from next.frame.io, you must pass the following parameters: - **access Token** - **account ID** - **folder ID** The result of the post is a **JSON** which contained the **id** of the space created. Space **id** can be used into a space source to use space content as a source for API operations. Example of a space source: ```json { \"space\": { \"id\": \"\" } } ```","useCases":["When the workflow goal is to create Space From Next Frame IO API"],"samplePrompts":["Create Space From Next Frame IO API","Create Space From Next Frame IO API with Adobe Substance3d"]})
    .withHandler(handler)
}

/** Create Space from URL API */
export function substance3d_create_space_url_v2(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "substance3d-create-space-url-v2")
    .withInput(z.object({
  body: z.array(schemas.Schema_rest_base_FileURL).nullable()
}))
    .withOutput(schemas.Schema_rest_base_Space)
    .withMetadata({"summary":"Create Space from URL API","description":"## Overview The **Substance 3D API** provides a way to upload and temporary store files. You can upload one or more files from one or more URLs. For each URL, there is an optional **filepath** parameter that allows you to specify the file name and its path. By combining multiple URLs with different **filepath** paths, you can compose a complete file tree structure. Example for this files tree: ``` ├── textures │ ├── diffuse.png │ └── normal.png └── lighthouse.fbx ``` Curl request: ``` curl --request POST \\ --url https://s3d.adobe.io/v2/spacesURL \\ --header 'Accept: application/json' \\ --header 'Authorization: Bearer 123' \\ --header 'Content-Type: application/json' \\ --data '[ { \"filepath\": \"lighthouse.fbx\", \"url\": \"https://url/to/lighthouse.fbx\" }, { \"filepath\": \"textures/diffuse.png\", \"url\": \"https://url/to/diffuse.png\" }, { \"filepath\": \"textures/normal.png\", \"url\": \"https://url/to/normal.png\" } ]' ``` The result of the post is a **JSON** which contained the **id** of the space created. Space **id** can be used into a space source to use space content as a source for API operations. Example of a space source: ```json { \"space\": { \"id\": \"\" } } ```","useCases":["When the workflow goal is to create Space from URL API"],"samplePrompts":["Create Space from URL API","Create Space from URL API with Adobe Substance3d"]})
    .withHandler(handler)
}
