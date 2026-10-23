/* eslint-disable */
/** Generated from audio-video/audio-video-api.json, audio-video/translate-lipsync-openapi.json — do not edit. */
import { z } from "zod"

export const Schema_SuccessfulVoicesResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "voices": z.array(Schema_VoiceEntity).optional()
})))

export const Schema_VoiceEntity: z.ZodTypeAny = z.lazy(() => (z.object({
  "voiceId": z.string().optional(),
  "displayName": z.string().optional(),
  "gender": z.string().optional(),
  "style": z.enum(["Casual", "Excited"]).optional(),
  "voiceType": z.string().optional(),
  "status": z.enum(["Active", "Inactive"]).optional(),
  "extendedPropertyMap": z.object({}).optional(),
  "wordsPerMinute": z.string().optional(),
  "rolePlayList": z.array(z.string()).optional(),
  "sampleURL": z.string().optional()
})))

export const Schema_SuccessfulAvatarsResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "avatars": z.array(Schema_AvatarEntity).optional()
})))

export const Schema_AvatarEntity: z.ZodTypeAny = z.lazy(() => (z.object({
  "avatarId": z.string().optional(),
  "displayName": z.string().optional(),
  "gender": z.string().optional(),
  "clothingStyle": z.enum(["Casual", "Formal", "Professional"]).optional(),
  "ageGroup": z.enum(["Young Adult", "Middle Aged", "Senior"]).optional(),
  "ethnicity": z.string().optional(),
  "style": z.string().optional(),
  "status": z.enum(["Active", "Inactive"]).optional(),
  "extendedPropertyMap": z.object({
  "aspectRatio": z.object({
  "x": z.number().int().optional(),
  "y": z.number().int().optional()
}).optional(),
  "resolution": z.object({
  "width": z.number().int().optional(),
  "height": z.number().int().optional()
}).optional()
}).optional(),
  "thumbnailUrls": z.object({
  "hd": z.string().optional(),
  "lowRes": z.string().optional()
}).optional(),
  "voiceId": z.string().optional(),
  "sampleVideo": z.object({
  "webm": z.string().optional(),
  "mp4": z.string().optional()
}).optional()
})))

export const Schema_SupportedLanguageCode: z.ZodTypeAny = z.lazy(() => (z.enum(["en-US", "es-ES", "de-DE", "fr-FR", "da-DK", "en-GB", "en-IN", "es-419", "es-AR", "fr-CA", "hi-IN", "it-IT", "ja-JP", "ko-KR", "nb-NO", "pt-BR", "pt-PT", "nl-NL", "zh-CN", "sv-SE"])))

export const Schema_SupportedAudioOutputAudioFormat: z.ZodTypeAny = z.lazy(() => (z.enum(["audio/wav"])))

export const Schema_SupportedOutputVideoFormat: z.ZodTypeAny = z.lazy(() => (z.enum(["video/mp4"])))

export const Schema_SupportedBackgroundType: z.ZodTypeAny = z.lazy(() => (z.enum(["color", "video", "image"])))

export const Schema_TTSRequest: z.ZodTypeAny = z.lazy(() => (Schema_GenerateSpeechUsingPlainText))

export const Schema_GenerateSpeechUsingPlainText: z.ZodTypeAny = z.lazy(() => (z.object({
  "script": z.union([Schema_TextSource, Schema_URLSource]),
  "voiceId": z.string(),
  "output": z.object({
  "mediaType": Schema_SupportedAudioOutputAudioFormat
})
})))

export const Schema_TextSource: z.ZodTypeAny = z.lazy(() => (z.string()))

export const Schema_URLSource: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": z.object({
  "url": z.string().optional()
}).optional()
})))

export const Schema_AvatarRequest: z.ZodTypeAny = z.lazy(() => (z.union([Schema_GenerateAvatarUsingPlainText, Schema_GenerateAvatarUsingAudioFile])))

export const Schema_GenerateAvatarUsingPlainText: z.ZodTypeAny = z.lazy(() => (z.object({
  "script": z.union([Schema_TextSource, Schema_URLSource]),
  "voiceId": z.string(),
  "avatarId": z.string(),
  "output": Schema_AvatarOutputObject
})))

export const Schema_AvatarOutputObject: z.ZodTypeAny = z.lazy(() => (z.object({
  "mediaType": Schema_SupportedOutputVideoFormat,
  "background": z.union([Schema_OutputColor, Schema_URLSource]).optional(),
  "resolution": z.object({
  "width": z.string().optional(),
  "height": z.string().optional()
}).optional()
})))

export const Schema_OutputColor: z.ZodTypeAny = z.lazy(() => (z.string()))

export const Schema_GenerateAvatarUsingAudioFile: z.ZodTypeAny = z.lazy(() => (z.object({
  "audio": z.object({
  "source": Schema_URLObject,
  "mediaType": z.enum(["audio/wav"]),
  "localeCode": Schema_SupportedLanguageCode
}),
  "avatarId": z.string(),
  "output": Schema_AvatarOutputObject
})))

export const Schema_URLObject: z.ZodTypeAny = z.lazy(() => (z.object({
  "url": z.string().optional()
})))

export const Schema_SubmitAPIResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "jobId": z.string().optional(),
  "statusUrl": z.string().optional()
})))

export const Schema_StatusAPIResponse: z.ZodTypeAny = z.lazy(() => (z.union([Schema_StatusAPIInprogressResponse, Schema_StatusAPICompletedResponse, Schema_StatusAPIFailedResponse, Schema_JobStatus])))

export const Schema_StatusAPIInprogressResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "jobId": z.string().optional(),
  "status": Schema_StatusAPIResponseStatus.optional()
})))

export const Schema_StatusAPIResponseStatus: z.ZodTypeAny = z.lazy(() => (z.enum(["pending", "running", "failed", "succeeded"])))

export const Schema_StatusAPICompletedResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "jobId": z.string().optional(),
  "status": Schema_StatusAPIResponseStatus.optional(),
  "output": z.object({
  "destination": Schema_Destination.optional()
}).optional()
})))

export const Schema_Destination: z.ZodTypeAny = z.lazy(() => (z.object({
  "url": z.string().optional()
})))

export const Schema_StatusAPIFailedResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "status": Schema_StatusAPIResponseStatus.optional(),
  "jobId": z.string().optional(),
  "error_code": z.string().optional(),
  "message": z.string().optional()
})))

export const Schema_JobStatus: z.ZodTypeAny = z.lazy(() => (z.object({
  "jobId": z.string(),
  "status": z.enum(["not_started", "running", "canceling", "canceled", "succeeded", "failed", "partially_succeeded"]),
  "message": z.string().optional(),
  "percentCompleted": z.string().optional(),
  "outputs": z.array(z.object({
  "variationIndex": z.number().int(),
  "presetIndex": z.number().int(),
  "destination": z.object({
  "url": z.string()
}),
  "sidecarDestination": z.object({
  "url": z.string()
}).optional(),
  "startedDate": z.string().optional(),
  "completedDate": z.string().optional()
})).optional(),
  "errors": z.array(z.object({
  "variationIndex": z.number().int(),
  "presetIndex": z.number().int(),
  "error": z.object({
  "error_code": z.string(),
  "message": z.string()
}),
  "startedDate": z.string().optional(),
  "completedDate": z.string().optional()
})).optional(),
  "createdDate": z.string().optional(),
  "totalJobItems": z.number().int().optional(),
  "retryPayloadUrl": z.string().optional(),
  "output": z.object({
  "fonts": z.array(z.object({
  "name": z.string(),
  "uploadRequired": z.boolean().optional()
})).optional(),
  "elements": z.array(z.object({
  "id": z.string().optional(),
  "type": z.enum(["mogrt", "aep"]),
  "controls": z.array(z.object({
  "variableId": z.string().optional(),
  "id": z.string().optional(),
  "label": z.string().optional(),
  "type": z.enum(["text", "media", "dropdown", "checkbox", "slider", "audio", "comment"]).optional(),
  "defaultData": z.object({}).optional(),
  "data": z.object({}).optional(),
  "options": z.union([z.record(z.string(), z.string()), z.array(z.string())]).optional(),
  "range": z.object({
  "minimum": z.number().optional(),
  "maximum": z.number().optional()
}).optional(),
  "size": z.object({
  "width": z.number().int().optional(),
  "height": z.number().int().optional()
}).optional(),
  "possibleScaleValues": z.array(z.string()).optional(),
  "durationInSeconds": z.number().optional(),
  "possibleAudioPreferences": z.array(z.string()).optional(),
  "text": z.string().optional()
})),
  "layers": z.array(z.object({
  "id": z.string().optional(),
  "name": z.string().optional(),
  "compName": z.string().optional()
})).optional()
})).optional()
}).optional()
})))

export const Schema_FailedResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "error_code": z.string().optional(),
  "message": z.string().optional()
})))

export const Schema_ErrorResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "error_code": z.string(),
  "message": z.string(),
  "messageId": z.string().optional()
})))

export const Schema_TemplateDescribeRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "type": z.enum(["mogrt", "aep"]).optional(),
  "source": z.object({
  "url": z.string()
}),
  "compName": z.string().optional()
})))

export const Schema_TemplateDescribeResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "jobId": z.string(),
  "statusUrl": z.string()
})))

export const Schema_PresetItem: z.ZodTypeAny = z.lazy(() => (z.object({
  "presetId": z.string(),
  "label": z.string(),
  "mediaType": z.string(),
  "codec": z.string(),
  "profile": z.string().optional(),
  "maxFps": z.object({
  "numerator": z.number().int(),
  "denominator": z.number().int()
}),
  "bitrateMode": z.string(),
  "targetBitrateInKbps": z.number().int().optional(),
  "maxBitrateInKbps": z.number().int().optional(),
  "alpha": z.boolean(),
  "primaryUsage": z.string()
})))

export const Schema_PresetsResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "items": z.array(Schema_PresetItem)
})))

export const Schema_TemplateRenderRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "type": z.enum(["mogrt", "aep"]).optional(),
  "source": z.object({
  "url": z.string()
}),
  "compName": z.string().optional(),
  "fonts": z.array(z.object({
  "name": z.string(),
  "source": z.object({
  "url": z.string()
})
})).optional(),
  "config": z.object({
  "handleMissingFonts": z.enum(["fail", "use_default"]).optional(),
  "sidecar": z.enum(["aep"]).optional()
}).optional(),
  "assets": z.array(z.object({
  "source": z.object({
  "url": z.string()
})
})).optional(),
  "presets": z.array(z.object({
  "source": z.object({
  "presetId": z.string().optional(),
  "url": z.string().optional()
})
})).optional(),
  "variations": z.array(z.object({
  "variables": z.array(z.object({
  "variableId": z.string(),
  "selectedCheckboxValue": z.boolean().optional(),
  "selectedDropdownValue": z.string().optional(),
  "selectedSliderValue": z.number().optional(),
  "text": z.string().optional(),
  "fontName": z.string().optional(),
  "assetIndex": z.number().int().optional(),
  "scale": z.enum(["no_scale", "fit_to_frame", "stretch_to_fill", "fill_frame"]).optional(),
  "audioPreference": z.enum(["replace", "mix"]).optional()
}))
})),
  "layerOperations": z.array(z.object({
  "operation": z.enum(["trim_comp", "trim_inpoint", "trim_outpoint", "shift_inpoint", "shift_outpoint", "match_source_duration", "set_layer_duration", "stretch_layer", "enable_layer"]),
  "layerId": z.string().optional(),
  "refLayerId": z.string().optional(),
  "refInOut": z.enum(["in", "out"]).optional(),
  "startLayerId": z.string().optional(),
  "endLayerId": z.string().optional(),
  "startSeconds": z.number().optional(),
  "startFrames": z.number().int().optional(),
  "offsetSeconds": z.number().optional(),
  "offsetFrames": z.number().int().optional(),
  "durationSeconds": z.number().optional(),
  "durationFrames": z.number().int().optional(),
  "durationPercent": z.number().optional(),
  "videoEnabled": z.boolean().optional(),
  "audioEnabled": z.boolean().optional(),
  "solo": z.boolean().optional()
})).optional(),
  "outputs": z.array(z.object({
  "variationIndex": z.number().int(),
  "presetIndex": z.number().int(),
  "fileName": z.string().optional(),
  "destination": z.string().optional()
})).optional()
})))

export const Schema_TemplateRenderResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "jobId": z.string(),
  "statusUrl": z.string(),
  "cancelUrl": z.string().optional()
})))

export const Schema_Overlay: z.ZodTypeAny = z.lazy(() => (z.object({
  "mediaType": z.enum(["image/gif", "image/png", "image/jpeg"]),
  "source": z.object({
  "url": z.string()
}),
  "startTime": z.string(),
  "duration": z.string(),
  "scale": z.object({
  "width": z.number().int(),
  "height": z.number().int()
}),
  "position": z.object({
  "anchorPoint": z.enum(["top_left", "top_right", "bottom_left", "bottom_right", "center"]),
  "offsetX": z.number().int(),
  "offsetY": z.number().int()
}),
  "repeat": z.enum(["loop", "once"]).optional()
})))

export const Schema_GenerateReframedVideoJobErrorBody: z.ZodTypeAny = z.lazy(() => (z.object({
  "error_code": z.string(),
  "message": z.string()
})))

export const Schema_TranscribeRequest: z.ZodTypeAny = z.lazy(() => (z.union([Schema_TranscribeAudioInput, Schema_TranscribeVideoInput])))

export const Schema_TranscribeAudioInput: z.ZodTypeAny = z.lazy(() => (z.object({
  "audio": Schema_AudioInput
})))

export const Schema_AudioInput: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": Schema_Source.optional(),
  "mediaType": Schema_AudioInputMediaType
})))

export const Schema_Source: z.ZodTypeAny = z.lazy(() => (z.object({
  "url": z.string().optional()
})))

export const Schema_AudioInputMediaType: z.ZodTypeAny = z.lazy(() => (z.enum(["audio/mp3", "audio/mpeg", "audio/x-wav", "audio/wav", "audio/vnd.dlna.adts", "audio/aac"])))

export const Schema_TranscribeVideoInput: z.ZodTypeAny = z.lazy(() => (z.object({
  "video": Schema_VideoInput
})))

export const Schema_VideoInput: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": Schema_Source.optional(),
  "mediaType": Schema_VideoInputMediaType,
  "metadata": z.object({
  "dialogTrackNumber": z.number().int().optional()
}).optional()
})))

export const Schema_VideoInputMediaType: z.ZodTypeAny = z.lazy(() => (z.enum(["video/mp4", "video/quicktime", "video/mov"])))

export const Schema_Captions: z.ZodTypeAny = z.lazy(() => (z.object({
  "targetFormats": z.array(Schema_TargetCaptionFormats).optional()
})))

export const Schema_TargetCaptionFormats: z.ZodTypeAny = z.lazy(() => (z.enum(["SRT"])))

export const Schema_DubRequest: z.ZodTypeAny = z.lazy(() => (z.union([Schema_DubAudioRequest, Schema_DubVideoRequest])))

export const Schema_DubAudioRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "targetLocaleCodes": z.array(Schema_DubTargetLocaleCodes).optional(),
  "transcripts": z.array(Schema_TranscriptInput).optional(),
  "audio": Schema_AudioInput
})))

export const Schema_DubTargetLocaleCodes: z.ZodTypeAny = z.lazy(() => (z.enum(["da-DK", "en-IN", "en-GB", "es-AR", "es-419", "fr-CA", "hi-IN", "ja-JP", "ko-KR", "nb-NO", "nl-NL", "pt-BR", "sv-SE", "zh-CN", "en-US", "es-ES", "de-DE", "fr-FR", "it-IT", "pt-PT"])))

export const Schema_TranscriptInput: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": Schema_Source,
  "localeCode": Schema_TranscriptInputLocale.optional()
})))

export const Schema_TranscriptInputLocale: z.ZodTypeAny = z.lazy(() => (z.enum(["da-DK", "en-IN", "en-GB", "es-AR", "es-419", "fr-CA", "hi-IN", "ja-JP", "ko-KR", "nb-NO", "nl-NL", "pt-BR", "sv-SE", "zh-CN", "en-US", "es-ES", "de-DE", "fr-FR", "it-IT", "pt-PT"])))

export const Schema_DubVideoRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "targetLocaleCodes": z.array(Schema_DubTargetLocaleCodes).optional(),
  "transcripts": z.array(Schema_TranscriptInput).optional(),
  "video": Schema_VideoInput,
  "lipSync": z.boolean().optional()
})))

export const Schema_JobStatusLinkResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "statusUrl": z.string(),
  "jobId": z.string()
})))

export const Schema_FireflyJobApiResponseStatus: z.ZodTypeAny = z.lazy(() => (z.enum(["pending", "running", "failed", "succeeded"])))

export const Schema_FireflyJobResponse: z.ZodTypeAny = z.lazy(() => (z.union([Schema_FireflyJobApiResponse, Schema_FireflyJobErrorResponse])))

export const Schema_FireflyJobApiResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "status": Schema_FireflyJobApiResponseStatus,
  "jobId": z.string(),
  "outputs": z.array(z.union([Schema_DubJobResponse, Schema_TranscribeOutput])).optional()
})))

export const Schema_DubJobResponse: z.ZodTypeAny = z.lazy(() => (z.union([Schema_DubSuccess, Schema_DubPartialFailure])))

export const Schema_DubSuccess: z.ZodTypeAny = z.lazy(() => (z.object({
  "audioOutput": Schema_AudioOutput.optional(),
  "videoOutput": Schema_VideoOutput.optional(),
  "transcriptOutput": Schema_TranscribeOutput.optional()
})))

export const Schema_AudioOutput: z.ZodTypeAny = z.lazy(() => (z.object({
  "mediaType": Schema_AudioOutputMediaType.optional(),
  "destination": Schema_Destination.optional()
})))

export const Schema_AudioOutputMediaType: z.ZodTypeAny = z.lazy(() => (z.enum(["audio/wav"])))

export const Schema_VideoOutput: z.ZodTypeAny = z.lazy(() => (z.object({
  "mediaType": Schema_VideoOutputMediaType.optional(),
  "destination": Schema_Destination.optional()
})))

export const Schema_VideoOutputMediaType: z.ZodTypeAny = z.lazy(() => (z.enum(["video/mp4", "video/mov"])))

export const Schema_TranscribeOutput: z.ZodTypeAny = z.lazy(() => (z.array(z.object({
  "destination": Schema_Destination.optional(),
  "captions": Schema_CaptionOutput.optional(),
  "localeCode": Schema_TranscriptInputLocale.optional()
}))))

export const Schema_CaptionOutput: z.ZodTypeAny = z.lazy(() => (z.array(z.object({
  "destination": Schema_Destination.optional(),
  "format": Schema_TargetCaptionFormats.optional()
}))))

export const Schema_DubPartialFailure: z.ZodTypeAny = z.lazy(() => (z.object({
  "error": Schema_ErrorBody.optional()
})))

export const Schema_ErrorBody: z.ZodTypeAny = z.lazy(() => (z.object({
  "message": z.string(),
  "error_code": z.string()
})))

export const Schema_FireflyJobErrorResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "status": Schema_FireflyJobApiResponseStatus,
  "jobId": z.string(),
  "message": z.string().optional(),
  "error_code": z.string().optional()
})))

export const Schema_TargetLocaleCodes: z.ZodTypeAny = z.lazy(() => (z.enum(["da-DK", "en-IN", "en-GB", "es-AR", "es-419", "fr-CA", "hi-IN", "ja-JP", "ko-KR", "nb-NO", "nl-NL", "pt-BR", "sv-SE", "zh-CN", "en-US", "es-ES", "de-DE", "fr-FR", "it-IT", "pt-PT"])))

export const Schema_VideoInputV2: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": z.object({
  "url": z.string()
})
})))

export const Schema_AnalysisV2: z.ZodTypeAny = z.lazy(() => (z.object({
  "sceneEditDetection": z.boolean().optional(),
  "focalPoints": z.array(z.string().max(1000)).optional()
})))

export const Schema_OverlayV2: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": Schema_Source.optional(),
  "startTime": z.string().optional(),
  "duration": z.string().optional(),
  "scale": Schema_ScaleV2.optional(),
  "position": Schema_PositionV2.optional(),
  "repeat": z.union([z.null(), Schema_RepeatV2]).optional()
})))

export const Schema_ScaleV2: z.ZodTypeAny = z.lazy(() => (z.object({
  "width": z.number().int().optional(),
  "height": z.number().int().optional()
})))

export const Schema_PositionV2: z.ZodTypeAny = z.lazy(() => (z.object({
  "anchorPoint": z.enum(["top_left", "top_right", "bottom_left", "bottom_right", "center"]).optional(),
  "offsetX": z.number().int().nullable().optional(),
  "offsetY": z.number().int().nullable().optional()
})))

export const Schema_RepeatV2: z.ZodTypeAny = z.lazy(() => (z.enum(["stop_on_last_frame", "loop", "time_stretch"])))

export const Schema_AspectRatioV2: z.ZodTypeAny = z.lazy(() => (z.object({
  "x": z.number().int(),
  "y": z.number().int()
})))

export const Schema_OutputFormatV2: z.ZodTypeAny = z.lazy(() => (z.object({
  "media": z.enum(["none", "mp4", "mov", "source"]),
  "sidecar": z.enum(["json", "otio"])
})))

export const Schema_CompositionV2: z.ZodTypeAny = z.lazy(() => (z.object({
  "overlays": z.array(Schema_OverlayV2).optional()
})))

export const Schema_CancelAcceptedResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "jobId": z.string(),
  "status": z.enum(["canceling"])
})))

export const Schema_PagingInfo: z.ZodTypeAny = z.lazy(() => (z.object({
  "nextUrl": z.string().optional(),
  "totalRecords": z.number().int()
})))

export const Schema_RenderJobListItem: z.ZodTypeAny = z.lazy(() => (z.object({
  "jobId": z.string(),
  "status": z.enum(["not_started", "running", "succeeded", "partially_succeeded", "failed", "canceled"]),
  "totalJobItems": z.number().int(),
  "percentCompleted": z.number().min(0).max(100).optional(),
  "createdDate": z.string(),
  "completedDate": z.string().optional(),
  "statusUrl": z.string(),
  "cancelUrl": z.string().optional()
})))

export const Schema_RenderJobListResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "paging": Schema_PagingInfo,
  "jobs": z.array(Schema_RenderJobListItem)
})))
