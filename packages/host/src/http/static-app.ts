import { createReadStream, existsSync, statSync } from "node:fs"
import path from "node:path"
import type { ServerResponse } from "node:http"

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
}

/**
 * Serve a file under the App static root for `GET /app/*`.
 * @returns `true` when a response was written.
 * @category Host
 */
export function serveAppStatic(
  appRoot: string,
  pathname: string,
  res: ServerResponse,
): boolean {
  const relative = pathname === "/app" || pathname === "/app/" ? "index.html" : pathname.slice("/app/".length)
  if (!relative || relative.includes("\0") || path.isAbsolute(relative)) {
    return false
  }
  const normalized = path.normalize(relative).replace(/^(\.\.(\/|\\|$))+/, "")
  if (normalized.startsWith("..")) return false

  let filePath = path.join(appRoot, normalized)
  if (!filePath.startsWith(appRoot)) return false

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    // SPA fallback for client routes under /app/.
    filePath = path.join(appRoot, "index.html")
    if (!existsSync(filePath)) return false
  }

  const ext = path.extname(filePath).toLowerCase()
  const isIndex = path.basename(filePath) === "index.html"
  const isHashedAsset = filePath.includes(`${path.sep}assets${path.sep}`) && !isIndex

  res.statusCode = 200
  res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream")
  res.setHeader(
    "Cache-Control",
    isIndex || !isHashedAsset ? "no-cache" : "public, max-age=31536000, immutable",
  )
  createReadStream(filePath).pipe(res)
  return true
}
