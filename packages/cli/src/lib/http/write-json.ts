import type { ServerResponse } from "node:http"
import { JSON_MIME } from "../up/constants.js"

/**
 * Write a JSON response with the given status code.
 * @category CLI
 */
export function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { "Content-Type": JSON_MIME })
  res.end(payload)
}
