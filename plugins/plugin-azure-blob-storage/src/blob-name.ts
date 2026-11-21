import { basename } from "node:path"
import { randomBytes } from "node:crypto"
import type { FileRef } from "@executioncontrolprotocol/plugin-sdk"

/**
 * Build the default blob name when upload omits `blobName`: `ecp/<runId>/<stepId>/<name>-<8 hex><.ext>`.
 * Every segment is sanitized (nested-call step ids contain `>` and `/`), and the file's extension is kept so the
 * blob is recognisable in the container and to services that go by extension.
 * @category Plugins
 */
export function defaultUploadBlobName(runId: string, stepId: string, file: FileRef): string {
  const { stem, ext } = splitName(basenameHint(file))
  const suffix = randomBytes(4).toString("hex")
  return `ecp/${segment(runId, "run")}/${segment(stepId, "step")}/${segment(stem, "upload")}-${suffix}${ext}`
}

function basenameHint(file: FileRef): string {
  if (file.kind === "file") return basename(file.path)
  if (file.kind === "artifact") return file.name ?? file.uri.split("/").pop() ?? "upload"
  try {
    const url = new URL(file.url)
    return decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "upload")
  } catch {
    return "upload"
  }
}

function splitName(name: string): { stem: string; ext: string } {
  const match = /^(.*?)(\.[A-Za-z0-9]{1,10})?$/.exec(name)
  const stem = match?.[1] || name
  const ext = match?.[2]?.toLowerCase() ?? ""
  return { stem, ext }
}

/** One path segment: letters, digits, `.`, `_`, `-`; at most 80 characters. */
function segment(value: string, fallback: string): string {
  const cleaned = value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80)
  return cleaned.length > 0 ? cleaned : fallback
}
