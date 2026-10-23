/* eslint-disable */
/** Generated from indesign/indesignapi.json — do not edit. */
import { z } from "zod"

export const Schema_HyphenationLanguage: z.ZodTypeAny = z.lazy(() => (z.enum(["Arabic", "Bengali (India)", "Bulgarian", "Burmese (Myanmar [Burma])", "Catalan", "Croatian", "Czech", "Danish", "Dutch: 2005 Reform", "Dutch: Old Rules", "English: Canadian", "English: UK", "English: USA", "English: USA Legal", "English: USA Medical", "Estonian", "Finnish", "French", "French: Canadian", "German: 1996 Reform", "German: 2006 Reform", "German: Austria 2006 Reform", "German: Old Rules", "German: Swiss", "German: Swiss 2006 Reform", "Greek", "Gujarati (India)", "Hebrew", "Hindi (India)", "Hungarian", "Indonesian (Indonesia)", "Italian", "Kannada (India)", "Khmer (Cambodia)", "Lao (Laos)", "Latvian", "Lithuanian", "Malayalam (India)", "Marathi (India)", "Norwegian: Bokmål", "Norwegian: Nynorsk", "Oriya (India)", "Polish", "Portuguese", "Portuguese: Brazilian", "Portuguese: Orthographic Agreement", "Punjabi (India)", "Romanian", "Russian", "Sinhala (Sri Lanka)", "Slovak", "Slovenian", "Spanish", "Swedish", "Tamil (India)", "Telugu (India)", "Thai", "Turkish", "Ukrainian", "Vietnamese"])))

export const Schema_InputAsset: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": z.object({
  "url": z.string()
}),
  "destination": z.string().optional()
})))

export const Schema_BaseJobRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "assets": z.array(Schema_InputAsset),
  "params": z.object({
  "generalSettings": z.object({
  "fonts": z.object({
  "fontsDirectories": z.array(z.string()).optional()
}).optional(),
  "links": z.object({
  "replaceLinks": z.array(z.object({
  "targetDocument": z.string(),
  "mapping": z.array(z.object({
  "newAssetRelativePath": z.string(),
  "currentURI": z.string().optional(),
  "linkID": z.number().int().optional()
}))
})).optional()
}).optional(),
  "appLogs": z.object({
  "logsRelativePath": z.string().optional()
}).optional()
}).optional()
}).optional()
})))

export const Schema_OutputAsset: z.ZodTypeAny = z.lazy(() => (z.object({
  "destination": z.object({
  "url": z.string(),
  "storageType": z.enum(["Azure", "Dropbox", "AWS"]).optional()
}),
  "source": z.string()
})))

export const Schema_BaseJobRequestWithOutput: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_BaseJobRequest, z.object({
  "outputs": z.array(Schema_OutputAsset).optional()
}))))

export const Schema_MergeDataRequest: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_BaseJobRequestWithOutput, z.object({
  "params": z.object({
  "targetDocument": z.string(),
  "dataSource": z.string(),
  "outputMediaType": z.enum(["image/jpeg", "image/png", "application/pdf", "application/x-indesign"]).optional(),
  "exportSettings": z.object({
  "jobOptionsFile": z.string().optional(),
  "pdfPreset": z.enum(["High Quality Print", "PDF/X-1a:2001", "PDF/X-3:2002", "PDF/X-4:2008", "Press Quality", "Smallest File Size"]).optional(),
  "quality": z.enum(["low", "medium", "high", "maximum"]).optional(),
  "linkImages": z.boolean().optional()
}).optional(),
  "recordRange": z.string().optional(),
  "allowMultipleRecordsPerPage": z.boolean().optional(),
  "multipleRecordLayoutOptions": z.object({
  "arrangeBy": z.enum(["rows_first", "columns_first"]).optional(),
  "bottomMargin": z.string().optional(),
  "topMargin": z.string().optional(),
  "leftMargin": z.string().optional(),
  "rightMargin": z.string().optional(),
  "columnSpacing": z.string().optional(),
  "rowSpacing": z.string().optional()
}).optional(),
  "imagePlacementOptions": z.object({
  "centerImage": z.boolean().optional(),
  "fittingOption": z.enum(["content_aware_fit", "fill_proportional", "fit_content_to_frame", "fit_frame_to_content", "honor_existing_style", "preserve_sizes", "proportional"]).optional(),
  "linkImages": z.boolean().optional()
}).optional(),
  "hyphenationSettings": z.object({
  "afterFirst": z.number().int().optional(),
  "beforeLast": z.number().int().optional(),
  "wordsLongerThan": z.number().int().optional(),
  "ladderLimit": z.number().int().optional(),
  "zone": z.number().optional(),
  "capitalizedWords": z.boolean().optional(),
  "lastWord": z.boolean().optional(),
  "acrossColumns": z.boolean().optional(),
  "dictionarySettings": z.array(z.object({
  "language": Schema_HyphenationLanguage,
  "wordList": z.array(z.string())
})).optional()
}).optional(),
  "pagesPerDocument": z.number().int().optional(),
  "removeBlankLines": z.boolean().optional(),
  "convertUrlToHyperlink": z.boolean().optional(),
  "outputFileBaseString": z.string().optional(),
  "outputFolderPath": z.string().optional()
})
}))))

export const Schema_Error: z.ZodTypeAny = z.lazy(() => (z.object({
  "message": z.string(),
  "error_code": z.string()
})))

export const Schema_MergeDataTagsRequest: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_BaseJobRequest, z.object({
  "params": z.object({
  "targetDocument": z.string(),
  "dataSource": z.string().optional(),
  "filter": z.array(z.enum(["all", "text", "image", "qr"])).optional(),
  "includePageItemIdentifiers": z.boolean().optional()
})
}))))

export const Schema_RemapLinksRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "assets": z.array(Schema_InputAsset),
  "params": z.object({
  "targetDocument": z.array(z.string()),
  "dataSource": z.array(z.object({
  "sourceURI": z.string(),
  "destinationURI": z.string()
}))
}),
  "outputs": z.array(Schema_OutputAsset).optional()
})))

export const Schema_DocumentInfoRequest: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_BaseJobRequest, z.object({
  "params": z.object({
  "targetDocument": z.string(),
  "pageInfo": z.object({
  "enabled": z.boolean().optional()
}).optional(),
  "linkInfo": z.object({
  "enabled": z.boolean().optional()
}).optional(),
  "fontInfo": z.object({
  "enabled": z.boolean().optional()
}).optional(),
  "pageItemInfo": z.object({
  "enabled": z.boolean().optional()
}).optional(),
  "textStoryInfo": z.object({
  "enabled": z.boolean().optional()
}).optional()
})
}))))

export const Schema_ConvertToInDesignRequest: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_BaseJobRequestWithOutput, z.object({
  "params": z.object({
  "targetDocuments": z.array(z.string()),
  "outputMediaType": z.enum(["application/x-indesign", "application/vnd.adobe.indesign-idml-package"]),
  "embedLinks": z.boolean().optional(),
  "outputFilebaseString": z.string().optional()
})
}))))

export const Schema_ConvertToInDesignResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "outputs": z.array(z.object({
  "outputPath": z.string().optional(),
  "input": z.string().optional(),
  "warnings": z.object({
  "missingLinks": z.array(z.string()).optional(),
  "missingFonts": z.array(z.string()).optional(),
  "otherWarnings": z.array(z.string()).optional()
}).optional()
})).optional()
})))

export const Schema_CreateRenditionRequest: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_BaseJobRequestWithOutput, z.object({
  "params": z.object({
  "targetDocuments": z.array(z.string()),
  "outputMediaType": z.enum(["image/jpeg", "image/png", "application/pdf"]),
  "exportingSpread": z.boolean().optional(),
  "pageRange": z.string().optional(),
  "quality": z.enum(["low", "medium", "high", "maximum"]).optional(),
  "renderingStyle": z.enum(["baseline_encoding", "progressive_encoding"]).optional(),
  "resolution": z.number().int().min(1).max(2400).optional(),
  "colorSpace": z.enum(["rgb", "cmyk", "gray"]).optional(),
  "embedColorProfile": z.boolean().optional(),
  "antiAlias": z.boolean().optional(),
  "simulateOverprint": z.boolean().optional(),
  "useDocumentBleeds": z.boolean().optional(),
  "colorSettingsFile": z.string().optional(),
  "transparentBackground": z.boolean().optional(),
  "createSeparateFiles": z.boolean().optional(),
  "optimizeForFastWebView": z.boolean().optional(),
  "embedPageThumbnails": z.boolean().optional(),
  "includeBookmarks": z.boolean().optional(),
  "includeHyperlinks": z.boolean().optional(),
  "exportNonprintingObjects": z.boolean().optional(),
  "exportGuidesAndGrids": z.boolean().optional(),
  "createTaggedPDF": z.boolean().optional(),
  "includeInteractiveElements": z.enum(["do_not_include", "appearance_only"]).optional(),
  "exportWhichLayers": z.enum(["export_all_layers", "export_visible_layers", "export_visible_printable_layers"]).optional(),
  "jobOptionsFile": z.string().optional(),
  "pdfPreset": z.enum(["High Quality Print", "PDF/X-1a:2001", "PDF/X-3:2002", "PDF/X-4:2008", "Press Quality", "Smallest File Size"]).optional(),
  "outputFileBaseString": z.string().optional(),
  "outputFolderPath": z.string().optional()
})
}))))

export const Schema_CustomScriptsListResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "capabilities": z.array(Schema_CustomScriptDetails).optional(),
  "paging": z.object({
  "nextUrl": z.string().optional()
}).optional()
})))

export const Schema_CustomScriptDetails: z.ZodTypeAny = z.lazy(() => (z.object({
  "version": z.string().optional(),
  "url": z.string().optional(),
  "downloadurl": z.string().optional(),
  "createdDate": z.string().optional(),
  "scriptName": z.string().optional(),
  "appVersionStrategy": z.enum(["latest_version", "fixed_major_version", "fixed_major_and_minor_version"]).optional(),
  "majorAppVersion": z.string().optional(),
  "minorAppVersion": z.string().optional()
})))

export const Schema_AppVersionUpdateRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "appVersionStrategy": z.enum(["latest_version", "fixed_major_version", "fixed_major_and_minor_version"]),
  "majorAppVersion": z.string().optional(),
  "minorAppVersion": z.string().optional()
})))

export const Schema_AppVersionInfo: z.ZodTypeAny = z.lazy(() => (z.object({
  "product": z.string().optional(),
  "majorAppVersion": z.string().optional(),
  "minorAppVersion": z.string().optional(),
  "status": z.enum(["active", "preview"]).optional()
})))

export const Schema_BaseEvent: z.ZodTypeAny = z.lazy(() => (z.object({
  "jobId": z.string().optional()
})))

export const Schema_notstartedEvent: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_BaseEvent, z.object({
  "status": z.enum(["not_started"]).optional()
}))))

export const Schema_runningEvent: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_BaseEvent, z.object({
  "status": z.enum(["running"]).optional(),
  "message": z.string().optional()
}))))

export const Schema_succeededEvent: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_BaseEvent, z.object({
  "status": z.enum(["succeeded"]).optional(),
  "data": z.object({}).optional(),
  "dataURL": z.string().optional(),
  "outputs": z.object({}).optional()
}))))

export const Schema_failedEvent: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_BaseEvent, z.object({
  "status": z.enum(["failed"]).optional(),
  "errors": z.array(z.object({
  "error_code": z.string().optional(),
  "message": z.string().optional(),
  "source": z.string().optional(),
  "url": z.string().optional()
})).optional()
}))))

export const Schema_partialSuccessEvent: z.ZodTypeAny = z.lazy(() => (z.intersection(Schema_BaseEvent, z.object({
  "status": z.enum(["partial_success"]).optional(),
  "data": z.object({}).optional(),
  "dataURL": z.string().optional(),
  "outputs": z.object({}).optional(),
  "errors": z.array(z.object({
  "error_code": z.string().optional(),
  "message": z.string().optional(),
  "source": z.string().optional(),
  "url": z.string().optional()
})).optional()
}))))
