/* eslint-disable */
/** Generated from photoshop/photoshopv2-api.json — do not edit. */
import { z } from "zod"

export const Schema_ActionResource: z.ZodTypeAny = z.lazy(() => (z.object({
  "actionName": z.string().optional(),
  "source": z.union([Schema_CreativeCloudFileIdResourceInput, Schema_CreativeCloudResourceInput, Schema_InlineContentResourceInput, Schema_LightroomResourceInput, Schema_UrlResourceInput])
})))

export const Schema_CreativeCloudFileIdResourceInput: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_ResourceInput, z.object({
  "creativeCloudFileId": z.string().optional()
}))))

export const Schema_ResourceInput: z.ZodTypeAny = z.lazy(() => (z.object({})))

export const Schema_CreativeCloudResourceInput: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_ResourceInput, z.object({
  "creativeCloudPath": z.string().optional(),
  "creativeCloudProjectId": z.string().optional()
}))))

export const Schema_InlineContentResourceInput: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_ResourceInput, z.object({
  "content": z.string().min(0).max(51200).optional(),
  "contentType": z.string().optional()
}))))

export const Schema_LightroomResourceInput: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_ResourceInput, z.object({
  "lightroomPath": z.string().optional()
}))))

export const Schema_UrlResourceInput: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_ResourceInput, z.object({
  "url": z.string().optional()
}))))

export const Schema_ActionsOptions: z.ZodTypeAny = z.lazy(() => (z.object({
  "actions": z.array(Schema_ActionResource).optional(),
  "additionalContents": z.array(Schema_AdditionalContentResource).optional(),
  "brushes": z.array(Schema_BrushResource).optional(),
  "fontOptions": Schema_FontOptions.optional(),
  "patterns": z.array(Schema_PatternResource).optional(),
  "uxp": Schema_UxpResource.optional()
})))

export const Schema_AdditionalContentResource: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": Schema_PortableFileResourceInput
})))

export const Schema_PortableFileResourceInput: z.ZodTypeAny = z.lazy(() => (z.union([Schema_UrlResourceInput, Schema_CreativeCloudResourceInput, Schema_CreativeCloudFileIdResourceInput])))

export const Schema_BrushResource: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": Schema_PortableFileResourceInput
})))

export const Schema_FontOptions: z.ZodTypeAny = z.lazy(() => (z.object({
  "additionalFonts": z.array(Schema_AdditionalFont).optional(),
  "defaultFontPostScriptName": z.string().optional(),
  "missingFontStrategy": z.enum(["fail", "use_default"]).optional()
})))

export const Schema_AdditionalFont: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": Schema_PortableFileResourceInput.optional()
})))

export const Schema_PatternResource: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": Schema_PortableFileResourceInput
})))

export const Schema_UxpResource: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": z.union([Schema_CreativeCloudFileIdResourceInput, Schema_CreativeCloudResourceInput, Schema_InlineContentResourceInput, Schema_LightroomResourceInput, Schema_UrlResourceInput])
})))

export const Schema_ActionsRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "image": Schema_ImageSource,
  "options": Schema_ActionsOptions,
  "outputs": z.array(z.union([Schema_JpegOutput, Schema_JsonOutput, Schema_PngOutput, Schema_PsdOutput, Schema_PsdcOutput, Schema_TiffOutput]))
})))

export const Schema_ImageSource: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": Schema_FileResourceInput
})))

export const Schema_FileResourceInput: z.ZodTypeAny = z.lazy(() => (z.union([Schema_UrlResourceInput, Schema_CreativeCloudResourceInput, Schema_CreativeCloudFileIdResourceInput, Schema_LightroomResourceInput])))

export const Schema_JpegOutput: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_PhotoshopOutput, z.object({
  "quality": z.enum(["very_poor", "poor", "low", "medium", "high", "maximum", "photoshop_max"]).optional()
}))))

export const Schema_PhotoshopOutput: z.ZodTypeAny = z.lazy(() => (z.object({
  "cropMode": z.enum(["trim_to_transparency", "document_bounds", "layer_bounds"]).optional(),
  "destination": z.union([Schema_CreativeCloudDestination, Schema_EmbeddedDestination, Schema_HostedDestination, Schema_UrlDestination]),
  "height": z.number().int().min(0).optional(),
  "iccProfile": z.union([Schema_CustomIccProfile, Schema_StandardIccProfile]).optional(),
  "layers": z.array(Schema_ReferenceLayer).optional(),
  "maxWidth": z.number().int().min(0).optional(),
  "mediaType": z.enum(["image/jpeg", "image/png", "image/tiff", "image/vnd.adobe.photoshop", "document/vnd.adobe.cpsd+dcxucf", "document/vnd.adobe.cpsd+dcx", "application/json"]),
  "resample": z.enum(["nearest_neighbor", "bilinear", "bicubic", "bicubic_smoother", "bicubic_sharper"]).optional(),
  "scriptOutputPattern": z.string().min(0).max(255).optional(),
  "shouldOverwrite": z.boolean().optional(),
  "width": z.number().int().min(0).optional()
})))

export const Schema_CreativeCloudDestination: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_Destination, z.object({
  "creativeCloudPath": z.string().optional(),
  "creativeCloudProjectId": z.string().optional()
}))))

export const Schema_Destination: z.ZodTypeAny = z.lazy(() => (z.object({})))

export const Schema_EmbeddedDestination: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_Destination, z.object({
  "embedded": z.enum(["string", "base64", "json"]).optional()
}))))

export const Schema_HostedDestination: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_Destination, z.object({
  "validityPeriod": z.number().int().min(60).max(86400).optional()
}))))

export const Schema_UrlDestination: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_Destination, z.object({
  "storageType": z.enum(["azure", "dropbox"]).optional(),
  "url": z.string().optional()
}))))

export const Schema_CustomIccProfile: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_IccProfile, z.object({
  "imageMode": z.enum(["rgb", "grayscale", "cmyk"]).optional(),
  "name": z.string().min(0).max(255).optional(),
  "source": Schema_FileResourceInput.optional()
}))))

export const Schema_IccProfile: z.ZodTypeAny = z.lazy(() => (z.object({
  "type": z.enum(["standard", "custom"])
})))

export const Schema_StandardIccProfile: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_IccProfile, z.object({
  "imageMode": z.enum(["rgb", "grayscale"]).optional(),
  "name": z.enum(["Adobe RGB (1998)", "Apple RGB", "ColorMatch RGB", "sRGB IEC61966-2.1", "Dot Gain 10%", "Dot Gain 15%", "Dot Gain 20%", "Dot Gain 25%", "Dot Gain 30%", "Gray Gamma 1.8", "Gray Gamma 2.2"]).optional()
}))))

export const Schema_ReferenceLayer: z.ZodTypeAny = z.lazy(() => (z.object({
  "id": z.number().int().optional(),
  "name": z.string().optional()
})))

export const Schema_JsonOutput: z.ZodTypeAny = z.lazy(() => (Schema_PhotoshopOutput))

export const Schema_PngOutput: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_PhotoshopOutput, z.object({
  "compression": z.enum(["none", "very_low", "low", "medium_low", "medium", "medium_high", "default", "high", "very_high", "maximum"]).optional()
}))))

export const Schema_PsdOutput: z.ZodTypeAny = z.lazy(() => (Schema_PhotoshopOutput))

export const Schema_PsdcOutput: z.ZodTypeAny = z.lazy(() => (Schema_PhotoshopOutput))

export const Schema_TiffOutput: z.ZodTypeAny = z.lazy(() => (Schema_PhotoshopOutput))

export const Schema_AddAdjustmentLayer: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_OperationBase, z.object({
  "adjustments": z.union([Schema_BrightnessContrastAdjustments, Schema_ColorBalanceAdjustments, Schema_ExposureAdjustments, Schema_HueSaturationAdjustments]).optional(),
  "blendOptions": Schema_BlendOptions.optional(),
  "isClipped": z.boolean().optional(),
  "isVisible": z.boolean().optional(),
  "pixelMask": Schema_PixelMask.optional(),
  "protection": z.array(z.enum(["none", "all", "transparency", "composite", "position", "artboard_autonest"])).optional(),
  "transform": Schema_Transform.optional(),
  "transformMode": z.enum(["fit", "fill", "custom", "none"]).optional(),
  "type": z.enum(["layer", "solid_color_layer", "text_layer", "smart_object_layer", "adjustment_layer", "group_layer", "background_layer"]).optional()
}))))

export const Schema_OperationBase: z.ZodTypeAny = z.lazy(() => (z.object({
  "id": z.number().int().optional(),
  "name": z.string().optional(),
  "operation": z.union([Schema_AddOperation, Schema_DeleteOperation, Schema_EditOperation, Schema_MoveOperation])
})))

export const Schema_AddOperation: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_Operation, z.object({
  "placement": Schema_Placement.optional()
}))))

export const Schema_Operation: z.ZodTypeAny = z.lazy(() => (z.object({
  "type": z.enum(["add", "edit", "delete", "move"])
})))

export const Schema_Placement: z.ZodTypeAny = z.lazy(() => (z.object({
  "referenceLayer": Schema_ReferenceLayer.optional(),
  "type": z.enum(["below", "into", "top", "bottom", "above"])
})))

export const Schema_DeleteOperation: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_Operation, z.object({
  "shouldIncludeChildren": z.boolean().optional()
}))))

export const Schema_EditOperation: z.ZodTypeAny = z.lazy(() => (Schema_Operation))

export const Schema_MoveOperation: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_Operation, z.object({
  "placement": Schema_Placement.optional(),
  "shouldIncludeChildren": z.boolean().optional()
}))))

export const Schema_BrightnessContrastAdjustments: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_BaseAdjustment, z.object({
  "brightnessContrast": Schema_BrightnessContrast.optional()
}))))

export const Schema_BaseAdjustment: z.ZodTypeAny = z.lazy(() => (z.object({
  "type": z.enum(["hue_saturation", "brightness_contrast", "exposure", "color_balance"])
})))

export const Schema_BrightnessContrast: z.ZodTypeAny = z.lazy(() => (z.object({
  "brightness": z.number().int().min(-150).max(150).optional(),
  "contrast": z.number().int().min(-150).max(150).optional()
})))

export const Schema_ColorBalanceAdjustments: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_BaseAdjustment, z.object({
  "colorBalance": Schema_ColorBalance.optional()
}))))

export const Schema_ColorBalance: z.ZodTypeAny = z.lazy(() => (z.object({
  "highlightLevels": z.array(z.number().int().min(-100).max(100)).optional(),
  "midtoneLevels": z.array(z.number().int().min(-100).max(100)).optional(),
  "preserveLuminosity": z.boolean().optional(),
  "shadowLevels": z.array(z.number().int().min(-100).max(100)).optional()
})))

export const Schema_ExposureAdjustments: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_BaseAdjustment, z.object({
  "exposure": Schema_Exposure.optional()
}))))

export const Schema_Exposure: z.ZodTypeAny = z.lazy(() => (z.object({
  "exposureValue": z.number().min(-20).max(20).optional(),
  "gammaCorrection": z.number().min(0.01).max(9.99).optional(),
  "offset": z.number().min(-0.5).max(0.5).optional()
})))

export const Schema_HueSaturationAdjustments: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_BaseAdjustment, z.object({
  "hueSaturation": Schema_HueSaturation.optional()
}))))

export const Schema_HueSaturation: z.ZodTypeAny = z.lazy(() => (z.object({
  "colorize": z.boolean().optional(),
  "hueSaturationAdjustments": z.array(Schema_HueSaturationAdjustment).optional()
})))

export const Schema_HueSaturationAdjustment: z.ZodTypeAny = z.lazy(() => (z.object({
  "hue": z.number().int().optional(),
  "lightness": z.number().int().optional(),
  "localRange": Schema_LocalRange.optional(),
  "saturation": z.number().int().optional()
})))

export const Schema_LocalRange: z.ZodTypeAny = z.lazy(() => (z.object({
  "beginRamp": z.number().int().min(0).max(360).optional(),
  "beginSustain": z.number().int().min(0).max(360).optional(),
  "channelId": z.enum(["REDS", "YELLOWS", "GREENS", "CYANS", "BLUES", "MAGENTAS"]),
  "endRamp": z.number().int().min(0).max(360).optional(),
  "endSustain": z.number().int().min(0).max(360).optional()
})))

export const Schema_BlendOptions: z.ZodTypeAny = z.lazy(() => (z.object({
  "blendMode": z.enum(["normal", "dissolve", "darken", "multiply", "color_burn", "linear_burn", "darker_color", "lighten", "screen", "color_dodge", "linear_dodge", "lighter_color", "overlay", "soft_light", "hard_light", "vivid_light", "pin_light", "hard_mix", "difference", "exclusion", "subtract", "divide", "hue", "saturation", "color", "luminosity"]).optional(),
  "opacity": z.number().int().min(0).max(100).optional()
})))

export const Schema_PixelMask: z.ZodTypeAny = z.lazy(() => (z.object({
  "isEnabled": z.boolean().optional(),
  "isLinked": z.boolean().optional(),
  "offset": Schema_Offset.optional(),
  "source": Schema_FileResourceInput.optional()
})))

export const Schema_Offset: z.ZodTypeAny = z.lazy(() => (z.object({
  "horizontal": z.number().int().optional(),
  "vertical": z.number().int().optional()
})))

export const Schema_Transform: z.ZodTypeAny = z.lazy(() => (z.object({
  "anchor": Schema_Anchor.optional(),
  "angle": z.number().optional(),
  "dimension": Schema_Dimension.optional(),
  "horizontalAlign": z.enum(["left", "center", "right"]).optional(),
  "offset": Schema_Offset.optional(),
  "skew": Schema_Skew.optional(),
  "verticalAlign": z.enum(["top", "center", "bottom"]).optional()
})))

export const Schema_Anchor: z.ZodTypeAny = z.lazy(() => (z.object({
  "horizontal": z.number(),
  "vertical": z.number()
})))

export const Schema_Dimension: z.ZodTypeAny = z.lazy(() => (z.object({
  "height": z.number().int().min(0).max(32000).optional(),
  "width": z.number().int().min(0).max(32000).optional()
})))

export const Schema_Skew: z.ZodTypeAny = z.lazy(() => (z.object({
  "horizontal": z.number().int(),
  "vertical": z.number().int()
})))

export const Schema_AddBackgroundLayer: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_OperationBase, z.object({
  "blendOptions": Schema_BlendOptions.optional(),
  "image": Schema_ImageSource.optional(),
  "isVisible": z.boolean().optional(),
  "pixelMask": Schema_PixelMask.optional(),
  "protection": z.array(z.enum(["none", "all", "transparency", "composite", "position", "artboard_autonest"])).optional(),
  "transform": Schema_Transform.optional(),
  "transformMode": z.enum(["fit", "fill", "custom", "none"]).optional(),
  "type": z.enum(["layer", "solid_color_layer", "text_layer", "smart_object_layer", "adjustment_layer", "group_layer", "background_layer"]).optional()
}))))

export const Schema_AddGroupLayer: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_OperationBase, z.object({
  "blendOptions": Schema_BlendOptions.optional(),
  "children": z.array(z.union([Schema_AddAdjustmentLayer, Schema_AddBackgroundLayer, Schema_AddGroupLayer, Schema_AddLayer, Schema_AddSmartObjectLayer, Schema_AddSolidColorLayer, Schema_AddTextLayer, Schema_DeleteLayer, Schema_EditAdjustmentLayer, Schema_EditBackgroundLayer, Schema_EditGroupLayer, Schema_EditLayer, Schema_EditSmartObjectLayer, Schema_EditSolidColorLayer, Schema_EditTextLayer, Schema_MoveLayer])).optional(),
  "isVisible": z.boolean().optional(),
  "pixelMask": Schema_PixelMask.optional(),
  "protection": z.array(z.enum(["none", "all", "transparency", "composite", "position", "artboard_autonest"])).optional(),
  "transform": Schema_Transform.optional(),
  "transformMode": z.enum(["fit", "fill", "custom", "none"]).optional(),
  "type": z.enum(["layer", "solid_color_layer", "text_layer", "smart_object_layer", "adjustment_layer", "group_layer", "background_layer"]).optional()
}))))

export const Schema_AddLayer: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_OperationBase, z.object({
  "blendOptions": Schema_BlendOptions.optional(),
  "image": Schema_ImageSource.optional(),
  "isClipped": z.boolean().optional(),
  "isVisible": z.boolean().optional(),
  "pixelMask": Schema_PixelMask.optional(),
  "protection": z.array(z.enum(["none", "all", "transparency", "composite", "position", "artboard_autonest"])).optional(),
  "transform": Schema_Transform.optional(),
  "transformMode": z.enum(["fit", "fill", "custom", "none"]).optional(),
  "type": z.enum(["layer", "solid_color_layer", "text_layer", "smart_object_layer", "adjustment_layer", "group_layer", "background_layer"]).optional()
}))))

export const Schema_AddSmartObjectLayer: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_OperationBase, z.object({
  "blendOptions": Schema_BlendOptions.optional(),
  "isClipped": z.boolean().optional(),
  "isVisible": z.boolean().optional(),
  "pixelMask": Schema_PixelMask.optional(),
  "protection": z.array(z.enum(["none", "all", "transparency", "composite", "position", "artboard_autonest"])).optional(),
  "smartObject": Schema_SmartObject.optional(),
  "transform": Schema_Transform.optional(),
  "transformMode": z.enum(["fit", "fill", "custom", "none"]).optional(),
  "type": z.enum(["layer", "solid_color_layer", "text_layer", "smart_object_layer", "adjustment_layer", "group_layer", "background_layer"]).optional()
}))))

export const Schema_SmartObject: z.ZodTypeAny = z.lazy(() => (z.object({
  "isLinked": z.boolean().optional(),
  "smartObjectFile": Schema_SmartObjectFile.optional()
})))

export const Schema_SmartObjectFile: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": Schema_FileResourceInput.optional()
})))

export const Schema_AddSolidColorLayer: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_OperationBase, z.object({
  "blendOptions": Schema_BlendOptions.optional(),
  "fill": Schema_Fill.optional(),
  "isClipped": z.boolean().optional(),
  "isVisible": z.boolean().optional(),
  "pixelMask": Schema_PixelMask.optional(),
  "protection": z.array(z.enum(["none", "all", "transparency", "composite", "position", "artboard_autonest"])).optional(),
  "transform": Schema_Transform.optional(),
  "transformMode": z.enum(["fit", "fill", "custom", "none"]).optional(),
  "type": z.enum(["layer", "solid_color_layer", "text_layer", "smart_object_layer", "adjustment_layer", "group_layer", "background_layer"]).optional()
}))))

export const Schema_Fill: z.ZodTypeAny = z.lazy(() => (z.object({
  "solidColor": Schema_SolidColor.optional()
})))

export const Schema_SolidColor: z.ZodTypeAny = z.lazy(() => (z.object({
  "rgb": Schema_Rgb
})))

export const Schema_Rgb: z.ZodTypeAny = z.lazy(() => (z.object({
  "blue": z.number().int().min(0).max(255),
  "green": z.number().int().min(0).max(255),
  "red": z.number().int().min(0).max(255)
})))

export const Schema_AddTextLayer: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_OperationBase, z.object({
  "blendOptions": Schema_BlendOptions.optional(),
  "isClipped": z.boolean().optional(),
  "isVisible": z.boolean().optional(),
  "pixelMask": Schema_PixelMask.optional(),
  "protection": z.array(z.enum(["none", "all", "transparency", "composite", "position", "artboard_autonest"])).optional(),
  "text": Schema_Text.optional(),
  "transform": Schema_Transform.optional(),
  "transformMode": z.enum(["fit", "fill", "custom", "none"]).optional(),
  "type": z.enum(["layer", "solid_color_layer", "text_layer", "smart_object_layer", "adjustment_layer", "group_layer", "background_layer"]).optional()
}))))

export const Schema_Text: z.ZodTypeAny = z.lazy(() => (z.object({
  "antiAliasing": z.enum(["none", "sharp", "crisp", "strong", "smooth"]).optional(),
  "characterStyles": z.array(Schema_CharacterStyleRange).optional(),
  "content": z.string().optional(),
  "frame": z.union([Schema_AreaFrame, Schema_PointFrame]).optional(),
  "paragraphStyles": z.array(Schema_ParagraphStyleRange).optional(),
  "textOrientation": z.enum(["horizontal", "vertical"]).optional()
})))

export const Schema_CharacterStyleRange: z.ZodTypeAny = z.lazy(() => (z.object({
  "apply": Schema_Apply.optional(),
  "characterStyle": Schema_CharacterStyle.optional()
})))

export const Schema_Apply: z.ZodTypeAny = z.lazy(() => (z.object({
  "from": z.number().int().min(0),
  "to": z.number().int().min(0)
})))

export const Schema_CharacterStyle: z.ZodTypeAny = z.lazy(() => (z.object({
  "autoLeading": z.boolean().optional(),
  "capsOption": z.enum(["normal_caps", "small_caps", "all_caps", "all_small_caps"]).optional(),
  "font": Schema_Font.optional(),
  "fontAlpha": z.number().min(0).max(1).optional(),
  "fontColor": z.union([Schema_FontCmyk, Schema_FontGray, Schema_FontLab, Schema_FontRgb]).optional(),
  "fontSize": z.number().optional(),
  "letterSpacing": z.number().optional(),
  "lineHeight": z.number().optional(),
  "syntheticBold": z.boolean().optional(),
  "syntheticItalic": z.boolean().optional(),
  "underline": z.boolean().optional()
})))

export const Schema_Font: z.ZodTypeAny = z.lazy(() => (z.object({
  "postScriptName": z.string().optional()
})))

export const Schema_FontCmyk: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_FontColor, z.object({
  "black": z.number().int().min(0).max(32768).optional(),
  "cyan": z.number().int().min(0).max(32768).optional(),
  "magenta": z.number().int().min(0).max(32768).optional(),
  "yellow": z.number().int().min(0).max(32768).optional()
}))))

export const Schema_FontColor: z.ZodTypeAny = z.lazy(() => (z.object({})))

export const Schema_FontGray: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_FontColor, z.object({
  "gray": z.number().int().min(0).max(32768).optional()
}))))

export const Schema_FontLab: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_FontColor, z.object({
  "a": z.number().int().min(-16384).max(16384).optional(),
  "b": z.number().int().min(-16384).max(16384).optional(),
  "l": z.number().int().min(0).max(32768).optional()
}))))

export const Schema_FontRgb: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_FontColor, z.object({
  "blue": z.number().int().min(0).max(32768).optional(),
  "green": z.number().int().min(0).max(32768).optional(),
  "red": z.number().int().min(0).max(32768).optional()
}))))

export const Schema_AreaFrame: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_TextFrame, z.object({
  "bounds": Schema_Bounds.optional()
}))))

export const Schema_TextFrame: z.ZodTypeAny = z.lazy(() => (z.object({
  "type": z.enum(["point", "area"])
})))

export const Schema_Bounds: z.ZodTypeAny = z.lazy(() => (z.object({
  "bottom": z.number().int().optional(),
  "left": z.number().int().optional(),
  "right": z.number().int().optional(),
  "top": z.number().int().optional()
})))

export const Schema_PointFrame: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_TextFrame, z.object({
  "origin": Schema_Origin.optional()
}))))

export const Schema_Origin: z.ZodTypeAny = z.lazy(() => (z.object({
  "x": z.number().int().optional(),
  "y": z.number().int().optional()
})))

export const Schema_ParagraphStyleRange: z.ZodTypeAny = z.lazy(() => (z.object({
  "apply": Schema_Apply.optional(),
  "paragraphStyle": Schema_ParagraphStyle.optional()
})))

export const Schema_ParagraphStyle: z.ZodTypeAny = z.lazy(() => (z.object({
  "alignment": z.enum(["left", "center", "right", "justify", "justify_left", "justify_right", "justify_center"]).optional(),
  "endIndent": z.number().optional(),
  "firstLineIndent": z.number().optional(),
  "spaceAfter": z.number().optional(),
  "spaceBefore": z.number().optional(),
  "startIndent": z.number().optional(),
  "writingDirection": z.enum(["left_to_right", "right_to_left"]).optional()
})))

export const Schema_DeleteLayer: z.ZodTypeAny = z.lazy(() => (Schema_OperationBase))

export const Schema_EditAdjustmentLayer: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_OperationBase, z.object({
  "adjustments": z.union([Schema_BrightnessContrastAdjustments, Schema_ColorBalanceAdjustments, Schema_ExposureAdjustments, Schema_HueSaturationAdjustments]).optional(),
  "blendOptions": Schema_BlendOptions.optional(),
  "isClipped": z.boolean().optional(),
  "isVisible": z.boolean().optional(),
  "pixelMask": Schema_EditPixelMask.optional(),
  "protection": z.array(z.enum(["none", "all", "transparency", "composite", "position", "artboard_autonest"])).optional(),
  "transform": Schema_Transform.optional(),
  "transformMode": z.enum(["fit", "fill", "custom", "none"]).optional(),
  "type": z.enum(["layer", "solid_color_layer", "text_layer", "smart_object_layer", "adjustment_layer", "group_layer", "background_layer"]).optional()
}))))

export const Schema_EditPixelMask: z.ZodTypeAny = z.lazy(() => (z.object({
  "delete": z.boolean(),
  "isEnabled": z.boolean().optional(),
  "isLinked": z.boolean().optional(),
  "offset": Schema_Offset.optional(),
  "source": Schema_FileResourceInput.optional()
})))

export const Schema_EditBackgroundLayer: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_OperationBase, z.object({
  "blendOptions": Schema_BlendOptions.optional(),
  "convertToLayer": z.boolean().optional(),
  "convertedLayerName": z.string().optional(),
  "image": Schema_ImageSource.optional(),
  "isVisible": z.boolean().optional(),
  "pixelMask": Schema_EditPixelMask.optional(),
  "protection": z.array(z.enum(["none", "all", "transparency", "composite", "position", "artboard_autonest"])).optional(),
  "transform": Schema_Transform.optional(),
  "transformMode": z.enum(["fit", "fill", "custom", "none"]).optional(),
  "type": z.enum(["layer", "solid_color_layer", "text_layer", "smart_object_layer", "adjustment_layer", "group_layer", "background_layer"]).optional()
}))))

export const Schema_EditGroupLayer: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_OperationBase, z.object({
  "blendOptions": Schema_BlendOptions.optional(),
  "isVisible": z.boolean().optional(),
  "pixelMask": Schema_EditPixelMask.optional(),
  "protection": z.array(z.enum(["none", "all", "transparency", "composite", "position", "artboard_autonest"])).optional(),
  "transform": Schema_Transform.optional(),
  "transformMode": z.enum(["fit", "fill", "custom", "none"]).optional(),
  "type": z.enum(["layer", "solid_color_layer", "text_layer", "smart_object_layer", "adjustment_layer", "group_layer", "background_layer"]).optional()
}))))

export const Schema_EditLayer: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_OperationBase, z.object({
  "blendOptions": Schema_BlendOptions.optional(),
  "image": Schema_ImageSource.optional(),
  "isClipped": z.boolean().optional(),
  "isVisible": z.boolean().optional(),
  "pixelMask": Schema_EditPixelMask.optional(),
  "protection": z.array(z.enum(["none", "all", "transparency", "composite", "position", "artboard_autonest"])).optional(),
  "transform": Schema_Transform.optional(),
  "transformMode": z.enum(["fit", "fill", "custom", "none"]).optional(),
  "type": z.enum(["layer", "solid_color_layer", "text_layer", "smart_object_layer", "adjustment_layer", "group_layer", "background_layer"]).optional()
}))))

export const Schema_EditSmartObjectLayer: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_OperationBase, z.object({
  "blendOptions": Schema_BlendOptions.optional(),
  "isClipped": z.boolean().optional(),
  "isVisible": z.boolean().optional(),
  "pixelMask": Schema_EditPixelMask.optional(),
  "protection": z.array(z.enum(["none", "all", "transparency", "composite", "position", "artboard_autonest"])).optional(),
  "smartObject": Schema_EditSmartObject.optional(),
  "transform": Schema_Transform.optional(),
  "transformMode": z.enum(["fit", "fill", "custom", "none"]).optional(),
  "type": z.enum(["layer", "solid_color_layer", "text_layer", "smart_object_layer", "adjustment_layer", "group_layer", "background_layer"]).optional()
}))))

export const Schema_EditSmartObject: z.ZodTypeAny = z.lazy(() => (z.object({
  "autoResize": z.boolean().optional(),
  "isLinked": z.boolean().optional(),
  "smartObjectFile": Schema_SmartObjectFile.optional()
})))

export const Schema_EditSolidColorLayer: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_OperationBase, z.object({
  "blendOptions": Schema_BlendOptions.optional(),
  "fill": Schema_Fill.optional(),
  "isClipped": z.boolean().optional(),
  "isVisible": z.boolean().optional(),
  "pixelMask": Schema_EditPixelMask.optional(),
  "protection": z.array(z.enum(["none", "all", "transparency", "composite", "position", "artboard_autonest"])).optional(),
  "transform": Schema_Transform.optional(),
  "transformMode": z.enum(["fit", "fill", "custom", "none"]).optional(),
  "type": z.enum(["layer", "solid_color_layer", "text_layer", "smart_object_layer", "adjustment_layer", "group_layer", "background_layer"]).optional()
}))))

export const Schema_EditTextLayer: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_OperationBase, z.object({
  "blendOptions": Schema_BlendOptions.optional(),
  "isClipped": z.boolean().optional(),
  "isVisible": z.boolean().optional(),
  "pixelMask": Schema_EditPixelMask.optional(),
  "protection": z.array(z.enum(["none", "all", "transparency", "composite", "position", "artboard_autonest"])).optional(),
  "text": Schema_Text.optional(),
  "transform": Schema_Transform.optional(),
  "transformMode": z.enum(["fit", "fill", "custom", "none"]).optional(),
  "type": z.enum(["layer", "solid_color_layer", "text_layer", "smart_object_layer", "adjustment_layer", "group_layer", "background_layer"]).optional()
}))))

export const Schema_MoveLayer: z.ZodTypeAny = z.lazy(() => (Schema_OperationBase))

export const Schema_ArtboardImageInput: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": Schema_FileResourceInput
})))

export const Schema_AutoStraighten: z.ZodTypeAny = z.lazy(() => (z.object({
  "constrainCrop": z.boolean().optional(),
  "enabled": z.boolean(),
  "uprightMode": z.enum(["auto", "full", "level", "vertical"]).optional()
})))

export const Schema_AutoCropAspectRatio: z.ZodTypeAny = z.lazy(() => (z.enum(["1:1", "16:9", "9:16", "4:3", "3:4", "4:5", "5:4", "3:2", "2:3", "21:9"])))

export const Schema_AutoCropBoundingBox: z.ZodTypeAny = z.lazy(() => (z.object({
  "height": z.number(),
  "url": z.string().optional(),
  "width": z.number(),
  "x": z.number(),
  "y": z.number()
})))

export const Schema_AutoCropCrop: z.ZodTypeAny = z.lazy(() => (z.object({
  "boundingBoxes": z.array(Schema_AutoCropBoundingBox)
})))

export const Schema_AutoCropImageMediaType: z.ZodTypeAny = z.lazy(() => (z.enum(["image/jpeg", "image/png", "image/webp"])))

export const Schema_AutoCropInputImage: z.ZodTypeAny = z.lazy(() => (z.object({
  "mediaType": Schema_AutoCropImageMediaType.optional(),
  "source": Schema_AutoCropUrlResource
})))

export const Schema_AutoCropUrlResource: z.ZodTypeAny = z.lazy(() => (z.object({
  "url": z.string()
})))

export const Schema_AutoCropMode: z.ZodTypeAny = z.lazy(() => (z.enum(["smartCrop", "subjectCrop", "fullSceneDetection", "objectDetection"])))

export const Schema_AutoCropObjectDetection: z.ZodTypeAny = z.lazy(() => (z.object({
  "boundingBoxes": z.array(Schema_AutoCropBoundingBox),
  "confidence": z.number(),
  "objectName": z.string()
})))

export const Schema_AutoCropOutput: z.ZodTypeAny = z.lazy(() => (z.object({
  "crops": z.array(Schema_AutoCropCrop),
  "objects": z.array(Schema_AutoCropObjectDetection),
  "subject": z.array(Schema_AutoCropCrop)
})))

export const Schema_AutoCropOutputType: z.ZodTypeAny = z.lazy(() => (z.enum(["images", "boundingBoxes"])))

export const Schema_AutoCropRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "aspectRatio": z.union([Schema_AutoCropAspectRatio, z.array(Schema_AutoCropAspectRatio)]).optional(),
  "focus": z.array(z.string()).optional(),
  "image": Schema_AutoCropInputImage,
  "mode": Schema_AutoCropMode,
  "outputType": Schema_AutoCropOutputType.optional(),
  "zoom": z.union([z.number(), z.array(z.number())]).optional()
})))

export const Schema_ColorAdjustments: z.ZodTypeAny = z.lazy(() => (z.object({
  "saturation": z.number().int().min(-100).max(100).optional(),
  "vibrance": z.number().int().min(-100).max(100).optional(),
  "whiteBalance": z.enum(["As Shot", "Auto", "Cloudy", "Custom", "Daylight", "Flash", "Fluorescent", "Shade", "Tungsten"]).optional()
})))

export const Schema_CreateArtboardRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "artboardSpacing": z.number().int().optional(),
  "images": z.array(Schema_ArtboardImageInput),
  "outputs": z.array(z.union([Schema_JpegOutput, Schema_JsonOutput, Schema_PngOutput, Schema_PsdOutput, Schema_PsdcOutput, Schema_TiffOutput]))
})))

export const Schema_CreateCompositeRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "edits": Schema_Edits.optional(),
  "fontOptions": Schema_FontOptions.optional(),
  "image": z.union([Schema_ImageParameters, Schema_ImageSource]),
  "outputs": z.array(z.union([Schema_JpegOutput, Schema_JsonOutput, Schema_PngOutput, Schema_PsdOutput, Schema_PsdcOutput, Schema_TiffOutput]))
})))

export const Schema_Edits: z.ZodTypeAny = z.lazy(() => (z.object({
  "document": Schema_Document.optional(),
  "layers": z.array(z.union([Schema_AddAdjustmentLayer, Schema_AddBackgroundLayer, Schema_AddGroupLayer, Schema_AddLayer, Schema_AddSmartObjectLayer, Schema_AddSolidColorLayer, Schema_AddTextLayer, Schema_DeleteLayer, Schema_EditAdjustmentLayer, Schema_EditBackgroundLayer, Schema_EditGroupLayer, Schema_EditLayer, Schema_EditSmartObjectLayer, Schema_EditSolidColorLayer, Schema_EditTextLayer, Schema_MoveLayer])).optional()
})))

export const Schema_Document: z.ZodTypeAny = z.lazy(() => (z.object({
  "crop": Schema_Crop.optional(),
  "resize": Schema_Resize.optional(),
  "trim": Schema_Trim.optional()
})))

export const Schema_Crop: z.ZodTypeAny = z.lazy(() => (z.object({
  "bounds": Schema_Bounds,
  "hide": z.boolean().optional()
})))

export const Schema_Resize: z.ZodTypeAny = z.lazy(() => (z.object({
  "constrainProportions": z.boolean().optional(),
  "height": Schema_DimensionMeasurement.optional(),
  "rasterize": z.boolean().optional(),
  "resample": z.enum(["nearest_neighbor", "bilinear", "bicubic", "bicubic_smoother", "bicubic_sharper"]).optional(),
  "resolution": Schema_ResolutionMeasurement.optional(),
  "scaleStyles": z.boolean().optional(),
  "width": Schema_DimensionMeasurement.optional()
})))

export const Schema_DimensionMeasurement: z.ZodTypeAny = z.lazy(() => (z.object({
  "unit": z.enum(["pixels_unit", "percent_unit", "distance_unit"]),
  "value": z.number().int().min(0).optional()
})))

export const Schema_ResolutionMeasurement: z.ZodTypeAny = z.lazy(() => (z.object({
  "unit": z.enum(["density_unit"]),
  "value": z.number().int().min(1).optional()
})))

export const Schema_Trim: z.ZodTypeAny = z.lazy(() => (z.object({
  "trimUpon": z.enum(["transparent_pixels"]).optional()
})))

export const Schema_ImageParameters: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_ImageInput, z.object({
  "depth": z.enum(["1", "8", "16", "32"]).optional(),
  "fill": z.enum(["white", "background_color", "transparent"]).optional(),
  "height": z.number().int().min(1).max(32000).optional(),
  "iccProfile": Schema_IccProfile.optional(),
  "mode": z.enum(["rgb", "bitmap", "grayscale", "indexed", "hsb", "cmyk", "lab", "duotone", "multichannel"]).optional(),
  "name": z.string().min(0).max(255).optional(),
  "pixelScaleFactor": z.number().min(0.1).optional(),
  "resolution": Schema_ResolutionMeasurement.optional(),
  "width": z.number().int().min(1).max(32000).optional()
}))))

export const Schema_ImageInput: z.ZodTypeAny = z.lazy(() => (z.object({})))

export const Schema_EditImageInput: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": Schema_FileResourceInput
})))

export const Schema_EditRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "edits": Schema_LightroomEdits.optional(),
  "image": Schema_EditImageInput,
  "outputs": z.array(z.union([Schema_LrDngOutput, Schema_LrJpegOutput, Schema_LrPngOutput, Schema_XmpOutput]))
})))

export const Schema_LightroomEdits: z.ZodTypeAny = z.lazy(() => (z.object({
  "autoStraighten": Schema_AutoStraighten.optional(),
  "autoTone": z.boolean().optional(),
  "color": Schema_ColorAdjustments.optional(),
  "effects": Schema_EffectsAdjustments.optional(),
  "light": Schema_LightAdjustments.optional(),
  "noiseReduction": Schema_NoiseReduction.optional(),
  "presets": z.array(Schema_FileResourceInput).optional(),
  "sharpen": Schema_SharpenAdjustments.optional(),
  "sharpness": z.number().int().min(0).max(150).optional(),
  "xmp": Schema_XmpInput.optional()
})))

export const Schema_EffectsAdjustments: z.ZodTypeAny = z.lazy(() => (z.object({
  "clarity": z.number().int().min(-100).max(100).optional(),
  "dehaze": z.number().int().min(-100).max(100).optional(),
  "texture": z.number().int().min(-100).max(100).optional(),
  "vignette": z.number().int().min(-100).max(100).optional()
})))

export const Schema_LightAdjustments: z.ZodTypeAny = z.lazy(() => (z.object({
  "blacks": z.number().int().min(-100).max(100).optional(),
  "contrast": z.number().int().min(-100).max(100).optional(),
  "exposure": z.number().min(-5).max(5).optional(),
  "highlights": z.number().int().min(-100).max(100).optional(),
  "shadows": z.number().int().min(-100).max(100).optional(),
  "whites": z.number().int().min(-100).max(100).optional()
})))

export const Schema_NoiseReduction: z.ZodTypeAny = z.lazy(() => (z.object({
  "color": z.number().int().min(0).max(100).optional(),
  "luminance": z.number().int().min(0).max(100).optional()
})))

export const Schema_SharpenAdjustments: z.ZodTypeAny = z.lazy(() => (z.object({
  "detail": z.number().int().min(0).max(100).optional(),
  "edgeMasking": z.number().int().min(0).max(100).optional(),
  "radius": z.number().min(0.5).max(3).optional()
})))

export const Schema_XmpInput: z.ZodTypeAny = z.lazy(() => (z.object({
  "masks": z.array(Schema_Mask).optional(),
  "orientation": z.enum(["top_left", "top_right", "bottom_right", "bottom_left", "left_top", "right_top", "right_bottom", "left_bottom"]).optional(),
  "source": Schema_FileResourceInput
})))

export const Schema_Mask: z.ZodTypeAny = z.lazy(() => (z.object({
  "digest": z.string(),
  "source": Schema_FileResourceInput
})))

export const Schema_LrDngOutput: z.ZodTypeAny = z.lazy(() => (Schema_LightroomOutput))

export const Schema_LightroomOutput: z.ZodTypeAny = z.lazy(() => (z.object({
  "destination": z.union([Schema_CreativeCloudDestination, Schema_EmbeddedDestination, Schema_HostedDestination, Schema_UrlDestination]),
  "mediaType": z.enum(["image/jpeg", "image/png", "image/x-adobe-dng", "application/rdf+xml"])
})))

export const Schema_LrJpegOutput: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_LightroomOutput, z.object({
  "quality": z.enum(["very_poor", "poor", "low", "medium", "high", "maximum", "photoshop_max"]).optional()
}))))

export const Schema_LrPngOutput: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_LightroomOutput, z.object({
  "compression": z.enum(["none", "very_low", "low", "medium_low", "medium", "medium_high", "default", "high", "very_high", "maximum"]).optional()
}))))

export const Schema_XmpOutput: z.ZodTypeAny = z.lazy(() => (Schema_LightroomOutput))

export const Schema_ErrorDetails: z.ZodTypeAny = z.lazy(() => (z.object({
  "errorCode": z.string().optional(),
  "message": z.string().optional()
})))

export const Schema_ErrorResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "error_code": z.string().optional(),
  "errors": z.array(Schema_ValidationError).optional(),
  "message": z.string().optional()
})))

export const Schema_ValidationError: z.ZodTypeAny = z.lazy(() => (z.object({
  "error_code": z.string().optional(),
  "message": z.string().optional()
})))

export const Schema_ExportOptions: z.ZodTypeAny = z.lazy(() => (z.object({
  "mediaType": z.enum(["image/jpeg", "image/png", "image/tiff", "image/vnd.adobe.photoshop", "document/vnd.adobe.cpsd+dcxucf", "document/vnd.adobe.cpsd+dcx", "application/json"])
})))

export const Schema_GenerateManifestRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "exportOptions": z.union([Schema_JpegExportOptions, Schema_PngExportOptions]).optional(),
  "extractSmartObjectData": z.boolean().optional(),
  "image": Schema_Image,
  "includeLayerThumbnails": z.boolean().optional(),
  "includeXmp": z.boolean().optional(),
  "maximumThumbnailDepth": z.number().int().min(0).optional(),
  "outputs": z.array(Schema_ManifestJsonOutput),
  "trimToTransparency": z.boolean().optional()
})))

export const Schema_JpegExportOptions: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_ExportOptions, z.object({
  "quality": z.enum(["very_poor", "poor", "low", "medium", "high", "maximum", "photoshop_max"]).optional()
}))))

export const Schema_PngExportOptions: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_ExportOptions, z.object({
  "compression": z.enum(["none", "very_low", "low", "medium_low", "medium", "medium_high", "default", "high", "very_high", "maximum"]).optional()
}))))

export const Schema_Image: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": Schema_FileResourceInput
})))

export const Schema_ManifestJsonOutput: z.ZodTypeAny = z.lazy(() => (Schema_ManifestOutput))

export const Schema_ManifestOutput: z.ZodTypeAny = z.lazy(() => (z.object({
  "destination": z.union([Schema_CreativeCloudDestination, Schema_EmbeddedDestination, Schema_HostedDestination, Schema_UrlDestination]),
  "mediaType": z.enum(["application/json"])
})))

export const Schema_JobAcceptedResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "jobId": z.string().optional(),
  "statusUrl": z.string().optional()
})))

export const Schema_JobStatusResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "createdTime": z.string().optional(),
  "errorDetails": z.array(Schema_ErrorDetails).optional(),
  "jobId": z.string().optional(),
  "modifiedTime": z.string().optional(),
  "result": Schema_Result.optional(),
  "status": z.string().optional()
})))

export const Schema_Result: z.ZodTypeAny = z.lazy(() => (z.object({
  "additionalFields": z.record(z.string(), z.object({})).optional(),
  "outputs": z.object({}).optional()
})))
