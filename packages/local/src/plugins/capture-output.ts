import type {
  ArtifactFileRef,
  CapturedFileRecord,
  FileMaxBytesSettings,
  FileRef,
  ScratchSpace as ScratchSpaceService,
} from "@executioncontrolprotocol/protocol"
import { ArtifactStore, ScratchSpace, captureSourceFromRef } from "@executioncontrolprotocol/protocol"
import type { CaptureOneDelegate, CaptureOneInput, ServiceLookup } from "@executioncontrolprotocol/engine"
import { createFileService } from "./files.js"

function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error && typeof (error as { code: unknown }).code === "string") {
    return (error as { code: string }).code
  }
  return "ECP_PROVIDER_ERROR"
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function artifactSnapshot(ref: Extract<FileRef, { kind: "artifact" }>): ArtifactFileRef {
  return {
    kind: "artifact",
    uri: ref.uri,
    ...(ref.mediaType !== undefined ? { mediaType: ref.mediaType } : {}),
    ...(ref.name !== undefined ? { name: ref.name } : {}),
    ...(ref.sizeBytes !== undefined ? { sizeBytes: ref.sizeBytes } : {}),
  }
}

/**
 * Build the delegate that captures output {@link FileRef}s through {@link createFileService}.
 * @category Plugins
 */
export function createCaptureOneDelegate(
  services: ServiceLookup,
  files: FileMaxBytesSettings,
): CaptureOneDelegate {
  const artifacts = services.get(ArtifactStore)
  const scratch = services.get(ScratchSpace) as ScratchSpaceService
  const captureCaps: FileMaxBytesSettings = {
    ...files,
    bytes: files.capture,
    stream: files.capture,
    path: files.capture,
    url: files.capture,
  }

  return async (input: CaptureOneInput): Promise<{ record: CapturedFileRecord }> => {
    const source = captureSourceFromRef(input.ref)
    const mediaTypeNotes: { path: string; declared?: string; sniffed: string }[] = []
    const fileService = createFileService({
      runId: input.runId,
      stepId: input.stepId,
      ...(input.executionDir ? { executionDir: input.executionDir } : {}),
      artifacts,
      scratch,
      maxBytes: captureCaps,
      mediaTypeNotes,
      notePath: input.outputPath,
    })
    try {
      const ref = input.ref as FileRef & { archive?: ArtifactFileRef }
      if (ref.kind === "artifact") {
        const archive = artifactSnapshot(ref)
        ref.archive = archive
        return { record: { path: input.outputPath, source, artifact: archive } }
      }
      // Stream source to store: a capture can be up to maxBytes.capture and must not sit in memory.
      const opened = await fileService.files.stream(ref)
      const written = await fileService.files.fromStream(opened.stream, {
        ...(opened.mediaType ? { mediaType: opened.mediaType } : {}),
        name: input.artifactName,
      })
      ref.archive = written
      return { record: { path: input.outputPath, source, artifact: written } }
    } catch (error) {
      return {
        record: {
          path: input.outputPath,
          source,
          error: { code: errorCode(error), message: errorMessage(error) },
        },
      }
    } finally {
      await fileService.releaseStep()
    }
  }
}