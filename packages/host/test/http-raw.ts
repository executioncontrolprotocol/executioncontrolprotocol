import { request as httpRequest } from "node:http"

/**
 * Low-level HTTP helper that can set a custom Host header.
 * @category Host
 */
export async function rawRequest(options: {
  baseUrl: string
  method?: string
  path: string
  headers?: Record<string, string>
  body?: string
}): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  const url = new URL(options.path, options.baseUrl)
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: options.method ?? "GET",
        headers: options.headers,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers as Record<string, string | string[] | undefined>,
            body: Buffer.concat(chunks).toString("utf8"),
          })
        })
      },
    )
    req.on("error", reject)
    if (options.body) req.write(options.body)
    req.end()
  })
}
