import type { FileRef, HandlerContext } from "@executioncontrolprotocol/plugin-sdk"

/** File-roundtrip handler. */
export default async function handler(
  input: {
    file: {
      kind: "file" | "url" | "artifact"
      path?: string
      url?: string
      uri?: string
      mediaType?: string
      name?: string
      headers?: Record<string, string>
      sizeBytes?: number
    }
  },
  ctx: HandlerContext,
): Promise<{ artifact: { kind: "artifact"; uri: string; mediaType?: string; name?: string; sizeBytes?: number } }> {
  const ref = input.file as FileRef
  const read = await ctx.files.bytes(ref)
  const artifact = await ctx.files.fromBytes(read.bytes, {
    mediaType: read.mediaType ?? input.file.mediaType ?? "application/octet-stream",
    name: read.name ?? input.file.name ?? "artifact.bin",
  })
  return { artifact }
}
