/* eslint-disable */
/** Generated Adobe substance3d capabilities — do not edit. */
import * as shells from "./shells.js"
import * as schemas from "./schemas.js"
import { invokeAdobeOperation } from "../../runtime/invoke.js"

/** Generate 3D object composite */
export const substance3d_v1_composites_compose = shells.substance3d_v1_composites_compose(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v1/composites/compose",
    baseUrl: "https://s3d.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_restv1beta_ComposeSceneResponse,
    asyncMode: "submit",
  })
})

/** Create 3D scene */
export const substance3d_v1_scenes_assemble = shells.substance3d_v1_scenes_assemble(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v1/scenes/assemble",
    baseUrl: "https://s3d.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_restv1beta_CreateSceneResponse,
    asyncMode: "submit",
  })
})

/** Convert 3D files */
export const substance3d_v1_scenes_convert = shells.substance3d_v1_scenes_convert(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v1/scenes/convert",
    baseUrl: "https://s3d.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_restv1beta_ModelConvertResponse,
    asyncMode: "submit",
  })
})

/** Describe 3D scene */
export const substance3d_v1_scenes_describe = shells.substance3d_v1_scenes_describe(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v1/scenes/describe",
    baseUrl: "https://s3d.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_restv1beta_SceneDescResponse,
    asyncMode: "submit",
  })
})

/** Render 3D object */
export const substance3d_v1_scenes_render = shells.substance3d_v1_scenes_render(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v1/scenes/render",
    baseUrl: "https://s3d.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_restv1beta_RenderSceneResponse,
    asyncMode: "submit",
  })
})

/** Render 3D object (basic version) */
export const substance3d_v1_scenes_render_basic = shells.substance3d_v1_scenes_render_basic(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v1/scenes/render-basic",
    baseUrl: "https://s3d.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_restv1beta_RenderModelResponse,
    asyncMode: "submit",
  })
})

/** Create Space */
export const substance3d_create_space_v1 = shells.substance3d_create_space_v1(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v1/spaces",
    baseUrl: "https://s3d.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: schemas.Schema_rest_base_Space,
    asyncMode: "none",
  })
})

/** Create Space API */
export const substance3d_create_space_v2 = shells.substance3d_create_space_v2(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v2/spaces",
    baseUrl: "https://s3d.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: schemas.Schema_rest_base_Space,
    asyncMode: "none",
  })
})

/** Create Space From Frame IO API */
export const substance3d_create_space_from_frame_io_v2 = shells.substance3d_create_space_from_frame_io_v2(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v2/spacesFrameIO",
    baseUrl: "https://s3d.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: schemas.Schema_rest_base_Space,
    asyncMode: "none",
  })
})

/** Create Space From Next Frame IO API */
export const substance3d_create_space_from_next_frame_io_v2 = shells.substance3d_create_space_from_next_frame_io_v2(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v2/spacesNextFrameIO",
    baseUrl: "https://s3d.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: schemas.Schema_rest_base_Space,
    asyncMode: "none",
  })
})

/** Create Space from URL API */
export const substance3d_create_space_url_v2 = shells.substance3d_create_space_url_v2(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v2/spacesURL",
    baseUrl: "https://s3d.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: schemas.Schema_rest_base_Space,
    asyncMode: "none",
  })
})
