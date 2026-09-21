/* eslint-disable */
/** Generated from substance3d/openapi.yaml — do not edit. */
import { z } from "zod"

export const Schema_ffapierrors_FFAPIError: z.ZodTypeAny = z.lazy(() => (z.object({
  "$schema": z.string().optional(),
  "error_code": z.string(),
  "error_details": z.array(z.object({})).optional(),
  "message": z.string().optional()
})))

export const Schema_ffapierrors_FFAPIErrorDetail: z.ZodTypeAny = z.lazy(() => (z.object({
  "error_code": z.string(),
  "error_context": z.record(z.string(), z.string()).optional(),
  "loc": z.string(),
  "msg": z.string()
})))

export const Schema_rest_base_FileFrameIO: z.ZodTypeAny = z.lazy(() => (z.object({
  "$schema": z.string().optional(),
  "accessToken": z.string(),
  "folderId": z.string()
})))

export const Schema_rest_base_FileNextFrameIO: z.ZodTypeAny = z.lazy(() => (z.object({
  "$schema": z.string().optional(),
  "accessToken": z.string(),
  "accountId": z.string(),
  "folderId": z.string()
})))

export const Schema_rest_base_FileURL: z.ZodTypeAny = z.lazy(() => (z.object({
  "filepath": z.string().optional(),
  "url": z.string()
})))

export const Schema_rest_base_MountedSource: z.ZodTypeAny = z.lazy(() => (z.object({
  "frame.io": Schema_rest_base_SourceFrameIO.optional(),
  "mountPoint": z.string().optional(),
  "next.frame.io": Schema_rest_base_SourceFrameIOV4.optional(),
  "space": Schema_rest_base_SourceSpace.optional(),
  "url": Schema_rest_base_SourceURL.optional()
})))

export const Schema_rest_base_SourceFrameIO: z.ZodTypeAny = z.lazy(() => (z.object({
  "accessToken": z.string(),
  "folderId": z.string()
})))

export const Schema_rest_base_SourceFrameIOV4: z.ZodTypeAny = z.lazy(() => (z.object({
  "accessToken": z.string(),
  "accountId": z.string(),
  "folderId": z.string()
})))

export const Schema_rest_base_SourceSpace: z.ZodTypeAny = z.lazy(() => (z.object({
  "id": z.string()
})))

export const Schema_rest_base_SourceURL: z.ZodTypeAny = z.lazy(() => (z.object({
  "filename": z.string().optional(),
  "url": z.string()
})))

export const Schema_rest_base_Space: z.ZodTypeAny = z.lazy(() => (z.object({
  "$schema": z.string().optional(),
  "expiry": z.string(),
  "files": z.array(Schema_rest_base_SpaceFile).nullable(),
  "id": z.string(),
  "url": z.string(),
  "archiveUrl": z.string().optional()
})))

export const Schema_rest_base_SpaceFile: z.ZodTypeAny = z.lazy(() => (z.object({
  "name": z.string(),
  "size": z.number().int().min(0),
  "url": z.string()
})))

export const Schema_restv1_ComposeSceneRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "$schema": z.string().optional(),
  "cameraName": z.string().optional(),
  "contentClass": z.enum(["art", "photo"]).optional(),
  "customModelId": z.string().optional(),
  "enableGroundPlane": z.boolean().optional(),
  "environment": Schema_types_ComposeEnvironment.optional(),
  "environmentExposure": z.number().min(-10).max(10).optional(),
  "heroAsset": z.string().min(1),
  "lightingSeeds": z.array(z.number().int()).optional(),
  "modelVersion": z.enum(["image3_fast", "image4_standard", "image4_ultra"]).optional(),
  "numVariations": z.number().int().min(1).max(4).optional(),
  "prompt": z.string().min(1),
  "scene": Schema_types_ComposeSceneSceneDetails.optional(),
  "sceneFile": z.string().optional(),
  "seeds": z.array(z.number().int()).optional(),
  "size": Schema_types_OutputSize.optional(),
  "sources": z.array(Schema_rest_base_MountedSource),
  "styleImage": z.string().optional()
})))

export const Schema_types_ComposeEnvironment: z.ZodTypeAny = z.lazy(() => (z.object({
  "file": z.string(),
  "rotation": Schema_types_Rotation.optional()
})))

export const Schema_types_Rotation: z.ZodTypeAny = z.lazy(() => (z.object({
  "euler": z.array(z.number()).optional(),
  "quaternion": z.array(z.number()).optional()
})))

export const Schema_types_ComposeSceneSceneDetails: z.ZodTypeAny = z.lazy(() => (z.object({
  "camera": Schema_types_SceneCamera.optional()
})))

export const Schema_types_SceneCamera: z.ZodTypeAny = z.lazy(() => (z.object({
  "focal": z.number().min(10).max(1000).optional(),
  "sensorWidth": z.number().min(1).max(100).optional(),
  "transform": Schema_types_Transform.optional()
})))

export const Schema_types_Transform: z.ZodTypeAny = z.lazy(() => (z.object({
  "azimuthAltitude": Schema_types_AzimuthAltitude.optional(),
  "matrix": z.array(z.number()).optional(),
  "trs": Schema_types_TRS.optional()
})))

export const Schema_types_AzimuthAltitude: z.ZodTypeAny = z.lazy(() => (z.object({
  "altitude": z.number().min(-90).max(90),
  "azimuth": z.number(),
  "lookAt": z.array(z.number()).nullable(),
  "radius": z.number().min(0)
})))

export const Schema_types_TRS: z.ZodTypeAny = z.lazy(() => (z.object({
  "rotation": Schema_types_Rotation,
  "scale": z.array(z.number()).nullable(),
  "translation": z.array(z.number()).nullable()
})))

export const Schema_types_OutputSize: z.ZodTypeAny = z.lazy(() => (z.object({
  "height": z.number().int().min(1).max(2688),
  "width": z.number().int().min(1).max(2688)
})))

export const Schema_restv1beta_ComposeOutput: z.ZodTypeAny = z.lazy(() => (z.object({
  "backgroundImage": Schema_restv1beta_ComposeOutputImage,
  "image": Schema_restv1beta_ComposeOutputImage,
  "lightingSeed": z.number().int(),
  "maskImage": Schema_restv1beta_ComposeOutputImage,
  "seed": z.number().int()
})))

export const Schema_restv1beta_ComposeOutputImage: z.ZodTypeAny = z.lazy(() => (z.object({
  "url": z.string()
})))

export const Schema_restv1beta_ComposeSceneJobResult: z.ZodTypeAny = z.lazy(() => (z.object({
  "outputSpace": Schema_rest_base_Space,
  "outputs": z.array(Schema_restv1beta_ComposeOutput),
  "promptHasBlockedArtists": z.boolean(),
  "promptHasDeniedWords": z.boolean(),
  "warnings": z.array(Schema_types_Warning).nullable().optional()
})))

export const Schema_types_Warning: z.ZodTypeAny = z.lazy(() => (z.object({
  "context": z.string(),
  "message": z.string()
})))

export const Schema_restv1beta_ComposeSceneRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "$schema": z.string().optional(),
  "cameraName": z.string().optional(),
  "contentClass": z.enum(["art", "photo"]).optional(),
  "customModelId": z.string().optional(),
  "enableGroundPlane": z.boolean().optional(),
  "environment": Schema_types_ComposeEnvironment.optional(),
  "environmentExposure": z.number().min(-10).max(10).optional(),
  "heroAsset": z.string().min(1),
  "lightingSeeds": z.array(z.number().int()).optional(),
  "modelVersion": z.enum(["image3_fast", "image4_standard", "image4_ultra"]).optional(),
  "numVariations": z.number().int().min(1).max(4).optional(),
  "prompt": z.string().min(1),
  "scene": Schema_types_ComposeSceneSceneDetails.optional(),
  "sceneFile": z.string().optional(),
  "seeds": z.array(z.number().int()).optional(),
  "size": Schema_types_OutputSize.optional(),
  "sources": z.array(Schema_rest_base_MountedSource),
  "styleImage": z.string().optional()
})))

export const Schema_restv1beta_ComposeSceneResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "$schema": z.string().optional(),
  "bugReportUrl": z.string(),
  "error": z.string().optional(),
  "id": z.string(),
  "result": Schema_restv1beta_ComposeSceneJobResult.optional(),
  "status": z.string(),
  "url": z.string()
})))

export const Schema_restv1beta_CreateSceneJobResult: z.ZodTypeAny = z.lazy(() => (z.object({
  "outputSpace": Schema_rest_base_Space,
  "sceneUrl": z.string()
})))

export const Schema_restv1beta_CreateSceneRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "$schema": z.string().optional(),
  "encoding": z.enum(["glb", "gltf", "fbx", "usdz", "usda", "usdc", "obj"]),
  "fileBaseName": z.string().min(1),
  "scene": Schema_types_SceneDescription,
  "sources": z.array(Schema_rest_base_MountedSource)
})))

export const Schema_types_SceneDescription: z.ZodTypeAny = z.lazy(() => (z.object({
  "baseFile": Schema_types_SceneBaseFile.optional(),
  "camera": Schema_types_SceneCamera.optional(),
  "environment": Schema_types_SceneEnvironment.optional(),
  "formatOptions": Schema_types_FormatOptions.optional(),
  "materials": z.array(Schema_types_MaterialAssign).nullable().optional(),
  "metersPerUnit": z.number().optional(),
  "models": Schema_types_SceneModels.optional()
})))

export const Schema_types_SceneBaseFile: z.ZodTypeAny = z.lazy(() => (z.object({
  "file": z.string(),
  "modelsRootNodeName": z.string().optional()
})))

export const Schema_types_SceneEnvironment: z.ZodTypeAny = z.lazy(() => (z.object({
  "exposure": z.number().min(-10).max(10).optional(),
  "file": z.string().optional(),
  "preserveLights": z.boolean().optional(),
  "rotation": Schema_types_Rotation.optional()
})))

export const Schema_types_FormatOptions: z.ZodTypeAny = z.lazy(() => (z.object({
  "usd": Schema_types_UsdOptions
})))

export const Schema_types_UsdOptions: z.ZodTypeAny = z.lazy(() => (z.object({
  "variants": z.array(Schema_types_UsdVariant).nullable()
})))

export const Schema_types_UsdVariant: z.ZodTypeAny = z.lazy(() => (z.object({
  "primName": z.string(),
  "variant": z.string(),
  "variantSet": z.string()
})))

export const Schema_types_MaterialAssign: z.ZodTypeAny = z.lazy(() => (z.object({
  "material": Schema_types_Material,
  "materialName": z.string(),
  "nodeList": z.array(z.string()).nullable(),
  "assignByDefault": z.boolean().optional(),
  "excludeFromDefault": z.array(z.string()).optional()
})))

export const Schema_types_Material: z.ZodTypeAny = z.lazy(() => (z.object({
  "sbs": Schema_types_SbsMaterial.optional(),
  "solidColor": Schema_types_SolidColorMaterial.optional()
})))

export const Schema_types_SbsMaterial: z.ZodTypeAny = z.lazy(() => (z.object({
  "preset": z.string().optional(),
  "resolution": z.union([z.literal(16), z.literal(32), z.literal(64), z.literal(128), z.literal(256), z.literal(512), z.literal(1024), z.literal(2048), z.literal(4096)]).optional(),
  "rotation": z.number().optional(),
  "sbsar": z.string().optional(),
  "scale": z.array(z.number()).optional(),
  "translation": z.array(z.number()).optional()
})))

export const Schema_types_SolidColorMaterial: z.ZodTypeAny = z.lazy(() => (z.object({
  "color": z.array(z.number()).nullable(),
  "metallicFactor": z.number().min(0).max(1).optional(),
  "roughnessFactor": z.number().min(0).max(1).optional()
})))

export const Schema_types_SceneModels: z.ZodTypeAny = z.lazy(() => (z.object({
  "imports": z.array(Schema_types_SceneModel).nullable().optional(),
  "modelsRootNodeTransform": Schema_types_Transform.optional()
})))

export const Schema_types_SceneModel: z.ZodTypeAny = z.lazy(() => (z.object({
  "anchorName": z.string().optional(),
  "file": z.string().optional(),
  "formatOptions": Schema_types_FormatOptions.optional(),
  "materialOverrides": z.array(Schema_types_MaterialOverride).nullable().optional(),
  "transform": Schema_types_Transform.optional()
})))

export const Schema_types_MaterialOverride: z.ZodTypeAny = z.lazy(() => (z.object({
  "absorptionColorFactor": z.array(z.number()).optional(),
  "absorptionColorTexture": z.string().optional(),
  "absorptionDistanceFactor": z.number().min(0).optional(),
  "absorptionDistanceTexture": z.string().optional(),
  "baseColorFactor": z.array(z.number()).optional(),
  "baseColorTexture": z.string().optional(),
  "coatColorFactor": z.array(z.number()).optional(),
  "coatColorTexture": z.string().optional(),
  "coatOpacityFactor": z.number().min(0).max(1).optional(),
  "coatOpacityTexture": z.string().optional(),
  "coatRoughnessFactor": z.number().min(0).max(1).optional(),
  "coatRoughnessTexture": z.string().optional(),
  "materialName": z.string(),
  "metallicFactor": z.number().min(0).max(1).optional(),
  "metallicTexture": z.string().optional(),
  "normalFactor": z.array(z.number()).optional(),
  "normalTexture": z.string().optional(),
  "opacityFactor": z.number().min(0).optional(),
  "opacityTexture": z.string().optional(),
  "pbrMaterial": Schema_types_SbsMaterial.optional(),
  "roughnessFactor": z.number().min(0).max(1).optional(),
  "roughnessTexture": z.string().optional(),
  "translucencyFactor": z.number().min(0).max(1).optional(),
  "translucencyTexture": z.string().optional(),
  "volumeThicknessFactor": z.number().min(0).optional(),
  "volumeThicknessTexture": z.string().optional()
})))

export const Schema_restv1beta_CreateSceneResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "$schema": z.string().optional(),
  "bugReportUrl": z.string(),
  "error": z.string().optional(),
  "id": z.string(),
  "result": Schema_restv1beta_CreateSceneJobResult.optional(),
  "status": z.string(),
  "url": z.string()
})))

export const Schema_restv1beta_ModelConvertJobResult: z.ZodTypeAny = z.lazy(() => (z.object({
  "outputSpace": Schema_rest_base_Space
})))

export const Schema_restv1beta_ModelConvertRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "$schema": z.string().optional(),
  "format": z.enum(["glb", "gltf", "fbx", "usdz", "usda", "usdc", "obj"]),
  "modelEntrypoint": z.string().optional(),
  "sources": z.array(Schema_rest_base_MountedSource)
})))

export const Schema_restv1beta_ModelConvertResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "$schema": z.string().optional(),
  "bugReportUrl": z.string(),
  "error": z.string().optional(),
  "id": z.string(),
  "result": Schema_restv1beta_ModelConvertJobResult.optional(),
  "status": z.string(),
  "url": z.string()
})))

export const Schema_restv1beta_RenderModelRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "$schema": z.string().optional(),
  "autoFraming": Schema_types_AutoFramingOptions.optional(),
  "background": Schema_types_BackgroundOptions.optional(),
  "cameraName": z.string().optional(),
  "extraOutputs": Schema_types_RenderExtraOutputs.optional(),
  "groundPlane": Schema_types_GroundPlaneOptions.optional(),
  "scene": Schema_types_SimpleSceneDescription,
  "size": Schema_types_SizeOptions.optional(),
  "sources": z.array(Schema_rest_base_MountedSource)
})))

export const Schema_types_AutoFramingOptions: z.ZodTypeAny = z.lazy(() => (z.object({
  "algorithm": z.enum(["auto", "bounding_cylinder", "frustum_fit"]).optional(),
  "zoomFactor": z.number().min(0.001).max(100).optional()
})))

export const Schema_types_BackgroundOptions: z.ZodTypeAny = z.lazy(() => (z.object({
  "backgroundColor": z.array(z.number()).nullable().optional(),
  "backgroundImage": z.string().optional(),
  "showEnvironment": z.boolean().optional()
})))

export const Schema_types_RenderExtraOutputs: z.ZodTypeAny = z.lazy(() => (z.object({
  "exportDistanceToCamera": z.boolean().optional(),
  "exportMaterialIds": z.boolean().optional(),
  "exportMaterialMasks": Schema_types_ExportMasksOptions.optional(),
  "exportMatte": Schema_types_RenderExtraOutputExportMatte.optional(),
  "exportObjectIds": z.boolean().optional(),
  "exportObjectMasks": Schema_types_ExportMasksOptions.optional()
})))

export const Schema_types_ExportMasksOptions: z.ZodTypeAny = z.lazy(() => (z.object({
  "selection": z.array(z.string()).nullable().optional()
})))

export const Schema_types_RenderExtraOutputExportMatte: z.ZodTypeAny = z.lazy(() => (z.object({
  "includeNodes": z.array(z.string()).nullable()
})))

export const Schema_types_GroundPlaneOptions: z.ZodTypeAny = z.lazy(() => (z.object({
  "autoGroundScene": z.boolean().optional(),
  "enable": z.boolean().optional(),
  "reflections": z.boolean().optional(),
  "reflectionsOpacity": z.number().min(0).max(1).optional(),
  "reflectionsRoughness": z.number().min(0).max(1).optional(),
  "shadows": z.boolean().optional(),
  "shadowsOpacity": z.number().min(0).max(1).optional()
})))

export const Schema_types_SimpleSceneDescription: z.ZodTypeAny = z.lazy(() => (z.object({
  "camera": Schema_types_SceneCamera.optional(),
  "environment": Schema_types_SceneEnvironment.optional(),
  "formatOptions": Schema_types_FormatOptions.optional(),
  "materialOverrides": z.array(Schema_types_MaterialOverride).nullable().optional(),
  "materials": z.array(Schema_types_MaterialAssign).nullable().optional(),
  "metersPerUnit": z.number().optional(),
  "modelFile": z.string().optional(),
  "modelTransform": Schema_types_Transform.optional()
})))

export const Schema_types_SizeOptions: z.ZodTypeAny = z.lazy(() => (z.object({
  "height": z.number().int().min(16).max(2304),
  "width": z.number().int().min(16).max(3840)
})))

export const Schema_restv1beta_RenderModelResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "$schema": z.string().optional(),
  "bugReportUrl": z.string(),
  "error": z.string().optional(),
  "id": z.string(),
  "result": Schema_restv1beta_RenderSceneJobResult.optional(),
  "status": z.string(),
  "url": z.string()
})))

export const Schema_restv1beta_RenderSceneJobResult: z.ZodTypeAny = z.lazy(() => (z.object({
  "distanceToCameraUrl": z.string().optional(),
  "materialIds": Schema_types_IdsMapData.optional(),
  "materialMasks": z.array(Schema_types_MaskNameToFileBinding).optional(),
  "matteUrl": z.string().optional(),
  "objectIds": Schema_types_IdsMapData.optional(),
  "objectMasks": z.array(Schema_types_MaskNameToFileBinding).optional(),
  "outputSpace": Schema_rest_base_Space,
  "renderUrl": z.string(),
  "warnings": z.array(Schema_types_Warning).nullable().optional()
})))

export const Schema_types_IdsMapData: z.ZodTypeAny = z.lazy(() => (z.object({
  "fileName": z.string(),
  "ids": z.array(Schema_types_NameToColorBinding).nullable()
})))

export const Schema_types_NameToColorBinding: z.ZodTypeAny = z.lazy(() => (z.object({
  "color": z.string(),
  "name": z.string()
})))

export const Schema_types_MaskNameToFileBinding: z.ZodTypeAny = z.lazy(() => (z.object({
  "fileName": z.string(),
  "name": z.string()
})))

export const Schema_restv1beta_RenderModelTurntableRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "$schema": z.string().optional(),
  "autoFraming": Schema_types_AutoFramingOptions.optional(),
  "background": Schema_types_BackgroundOptions.optional(),
  "cameraName": z.string().optional(),
  "exportFrames": z.boolean().optional(),
  "framerate": z.number().int().min(5).max(30).optional(),
  "groundPlane": Schema_types_GroundPlaneOptions.optional(),
  "mode": z.enum(["rotate_camera", "rotate_model", "rotate_environment"]).optional(),
  "rotationDirection": z.enum(["clockwise", "counter_clockwise"]).optional(),
  "scene": Schema_types_SimpleSceneDescription,
  "seconds": z.number().int().min(1).max(5).optional(),
  "size": Schema_types_SizeOptions.optional(),
  "sources": z.array(Schema_rest_base_MountedSource),
  "useRasterizer": z.boolean().optional()
})))

export const Schema_restv1beta_RenderModelTurntableResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "$schema": z.string().optional(),
  "bugReportUrl": z.string(),
  "error": z.string().optional(),
  "id": z.string(),
  "result": Schema_restv1beta_RenderSceneTurntableJobResult.optional(),
  "status": z.string(),
  "url": z.string()
})))

export const Schema_restv1beta_RenderSceneTurntableJobResult: z.ZodTypeAny = z.lazy(() => (z.object({
  "framesUrls": z.array(z.string()),
  "outputSpace": Schema_rest_base_Space,
  "renderUrl": z.string(),
  "warnings": z.array(Schema_types_Warning).nullable().optional()
})))

export const Schema_restv1beta_RenderSceneRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "$schema": z.string().optional(),
  "autoFraming": Schema_types_AutoFramingOptions.optional(),
  "background": Schema_types_BackgroundOptions.optional(),
  "cameraName": z.string().optional(),
  "extraOutputs": Schema_types_RenderExtraOutputs.optional(),
  "groundPlane": Schema_types_GroundPlaneOptions.optional(),
  "scene": Schema_types_SceneDescription,
  "size": Schema_types_SizeOptions.optional(),
  "sources": z.array(Schema_rest_base_MountedSource)
})))

export const Schema_restv1beta_RenderSceneResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "$schema": z.string().optional(),
  "bugReportUrl": z.string(),
  "error": z.string().optional(),
  "id": z.string(),
  "result": Schema_restv1beta_RenderSceneJobResult.optional(),
  "status": z.string(),
  "url": z.string()
})))

export const Schema_restv1beta_SceneDescJobResult: z.ZodTypeAny = z.lazy(() => (z.object({
  "stats": Schema_types_SceneStatsInfo
})))

export const Schema_types_SceneStatsInfo: z.ZodTypeAny = z.lazy(() => (z.object({
  "cameraNames": z.array(z.string()).nullable(),
  "materialNames": z.array(z.string()).nullable(),
  "metersPerSceneUnit": z.number(),
  "nodesHierarchy": Schema_types_SceneStatsNode,
  "numEquivalentTriangles": z.number().int(),
  "numExtraPolygons": z.number().int(),
  "numFaces": z.number().int(),
  "numLines": z.number().int(),
  "numMeshes": z.number().int(),
  "numPoints": z.number().int(),
  "numQuads": z.number().int(),
  "numSubMeshes": z.number().int(),
  "numTextures": z.number().int(),
  "numTriangles": z.number().int(),
  "numVertices": z.number().int(),
  "sceneUpAxis": z.string()
})))

export const Schema_types_SceneStatsNode: z.ZodTypeAny = z.lazy(() => (z.object({
  "assignedMaterialName": z.string().optional(),
  "cameraStats": Schema_types_CameraStats.optional(),
  "children": z.array(Schema_types_SceneStatsNode).nullable().optional(),
  "name": z.string(),
  "type": z.string(),
  "variants": z.array(Schema_types_SceneStatsNodeVariant).nullable().optional(),
  "worldSpaceBoundingBox": Schema_types_SceneStatsBoundingBox.optional()
})))

export const Schema_types_CameraStats: z.ZodTypeAny = z.lazy(() => (z.object({
  "aspectRatio": z.number(),
  "fStop": z.number(),
  "focalLength": z.number(),
  "focusDistance": z.number(),
  "horizontalAperture": z.number(),
  "horizontalApertureOffset": z.number(),
  "name": z.string(),
  "projection": z.string(),
  "verticalAperture": z.number(),
  "verticalApertureOffset": z.number()
})))

export const Schema_types_SceneStatsNodeVariant: z.ZodTypeAny = z.lazy(() => (z.object({
  "currentValue": z.string(),
  "name": z.string(),
  "values": z.array(z.string()).nullable()
})))

export const Schema_types_SceneStatsBoundingBox: z.ZodTypeAny = z.lazy(() => (z.object({
  "max": z.array(z.number()).nullable(),
  "min": z.array(z.number()).nullable()
})))

export const Schema_restv1beta_SceneDescRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "$schema": z.string().optional(),
  "sceneFile": z.string().optional(),
  "sources": z.array(Schema_rest_base_MountedSource)
})))

export const Schema_restv1beta_SceneDescResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "$schema": z.string().optional(),
  "bugReportUrl": z.string(),
  "error": z.string().optional(),
  "id": z.string(),
  "result": Schema_restv1beta_SceneDescJobResult.optional(),
  "status": z.string(),
  "url": z.string()
})))

export const Schema_types_RendererConfig: z.ZodTypeAny = z.lazy(() => (z.object({
  "type": z.enum(["ssca", "rtx"])
})))

export const Schema_types_ShadowCatchingMaterial: z.ZodTypeAny = z.lazy(() => (z.object({
  "reflectionOpacity": z.number(),
  "roughness": z.number(),
  "shadowOpacity": z.number()
})))
