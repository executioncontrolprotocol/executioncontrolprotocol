import type { CapturedFileRecord, EcpErrorCode, FileRef, ValidationIssue } from "@executioncontrolprotocol/protocol"
import { captureSourceFromRef, toSafeArtifactName, walkFileRefs } from "@executioncontrolprotocol/protocol"

/**
 * One file ref the host captures into the run artifact store.
 * @category Environment
 */
export interface CaptureOneInput {
  /** Run id. */
  runId: string
  /** Step id. */
  stepId: string
  /** JSON pointer to the ref in the output. */
  outputPath: string
  /** Source ref to capture. */
  ref: FileRef
  /** Target artifact file name (unique within the run). */
  artifactName: string
  /** Execution directory for relative `file` paths. */
  executionDir?: string
}

/**
 * Outcome of capturing one ref.
 * @category Environment
 */
export interface CaptureOneResult {
  /** Step-record entry; the ref in output may have been updated with `archive`. */
  record: CapturedFileRecord
}

/**
 * Host-injected capture implementation (no filesystem in the engine).
 * @category Environment
 */
export type CaptureOneDelegate = (input: CaptureOneInput) => Promise<CaptureOneResult>

/**
 * Options for {@link captureStepOutput}.
 * @category Environment
 */
export interface CaptureStepOutputOptions {
  /** Step id. */
  stepId: string
  /** Loop round, when the step runs in a loop: part of the artifact name so rounds don't overwrite each other. */
  round?: number
  /** `forEach` item path for artifact names (`step-i2.4-r1-…`). */
  items?: number[]
  /** When false, output is returned unchanged. */
  persist: boolean
  /** Run id for artifact writes. */
  runId: string
  /** Directory of the execution file. */
  executionDir?: string
  /** Injected capture; omitted in tests that skip I/O. */
  delegate?: CaptureOneDelegate
  /** Emit a warning when capture fails for one ref. */
  onWarning?: (issue: ValidationIssue) => void
}

function sourceNameHint(ref: FileRef): string {
  if (ref.kind === "file") {
    const base = ref.path.split(/[/\\]/).pop()
    return base && base.length > 0 ? base : "file"
  }
  if (ref.kind === "url") {
    try {
      const segment = new URL(ref.url).pathname.split("/").pop()
      return segment && segment.length > 0 ? segment : "download"
    } catch {
      return "download"
    }
  }
  return ref.name && ref.name.length > 0 ? ref.name : "artifact"
}

/** Extensions for common media types, for captures whose source name has none (presigned URLs often don't). */
const EXTENSION_BY_MEDIA_TYPE: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/vnd.adobe.photoshop": ".psd",
  "application/pdf": ".pdf",
  "video/mp4": ".mp4",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "application/json": ".json",
  "text/plain": ".txt",
}

function stepArtifactPrefix(stepId: string, round: number | undefined, items?: number[]): string {
  if (items !== undefined && items.length > 0) {
    const itemPart = `i${items.join(".")}`
    return round === undefined ? `${stepId}-${itemPart}` : `${stepId}-${itemPart}-r${round}`
  }
  return round === undefined ? stepId : `${stepId}-r${round}`
}

function baseArtifactName(
  stepId: string,
  round: number | undefined,
  items: number[] | undefined,
  outputPath: string,
  ref: FileRef,
): string {
  const pathPart = (outputPath.replace(/\//g, "-").replace(/^-/, "") || "output").slice(0, 80)
  const step = stepArtifactPrefix(stepId, round, items)
  let hint = sourceNameHint(ref)
  const ext = ref.mediaType ? EXTENSION_BY_MEDIA_TYPE[ref.mediaType.split(";")[0]!.trim().toLowerCase()] : undefined
  if (ext && !/\.[A-Za-z0-9]{1,10}$/.test(hint)) hint += ext
  return toSafeArtifactName(`${step}-${pathPart}-${hint}`, `${step}.bin`)
}

function uniqueArtifactName(base: string, used: Set<string>): string {
  let name = base
  let suffix = 2
  while (used.has(name)) {
    const dot = base.lastIndexOf(".")
    const stem = dot > 0 ? base.slice(0, dot) : base
    const ext = dot > 0 ? base.slice(dot) : ".bin"
    name = toSafeArtifactName(`${stem}-${suffix}${ext}`, `${stem}-${suffix}.bin`)
    suffix += 1
  }
  used.add(name)
  return name
}

/**
 * Walk step output {@link FileRef}s, capture each through the delegate, and attach `archive` on success.
 * @category Environment
 */
export async function captureStepOutput(
  output: unknown,
  options: CaptureStepOutputOptions,
): Promise<{ output: unknown; captured: CapturedFileRecord[] }> {
  if (!options.persist || !options.delegate || output === undefined) {
    return { output, captured: [] }
  }
  const usedNames = new Set<string>()
  const captured: CapturedFileRecord[] = []
  const visits: Array<{ ref: FileRef; path: string }> = []
  walkFileRefs(output, (ref, path) => {
    visits.push({ ref, path })
  })
  for (const { ref, path } of visits) {
    if (ref.archive) {
      const source = captureSourceFromRef(ref)
      captured.push({ path, source, artifact: ref.archive })
      continue
    }
    const artifactName = uniqueArtifactName(
      baseArtifactName(options.stepId, options.round, options.items, path, ref),
      usedNames,
    )
    const result = await options.delegate({
      runId: options.runId,
      stepId: options.stepId,
      outputPath: path,
      ref,
      artifactName,
      ...(options.executionDir ? { executionDir: options.executionDir } : {}),
    })
    captured.push(result.record)
    if (result.record.error) {
      options.onWarning?.({
        code: result.record.error.code as EcpErrorCode,
        severity: "warning",
        message: result.record.error.message,
        path: path || options.stepId,
      })
    }
  }
  return { output, captured }
}