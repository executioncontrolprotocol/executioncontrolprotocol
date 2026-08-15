import type { IncomingMessage } from "node:http"

/**
 * Read the full request body as UTF-8 text.
 * @category CLI
 */
export async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString("utf8")
}
