import { timingSafeEqual } from "node:crypto"
import type { ServiceContext } from "@executioncontrolprotocol/engine"
import { IMPLEMENTATION_IDS, type Auth } from "@executioncontrolprotocol/protocol"

/**
 * Options for {@link LocalTokenAuth}.
 * @category Host
 */
export interface LocalTokenAuthOptions {
  /** Bearer token (43-char base64url). */
  token: string
  /** Bound listen port used for Host/Origin checks. */
  port: number
}

/**
 * Local bearer-token auth with Host/Origin DNS-rebinding checks.
 * @category Host
 */
export class LocalTokenAuth implements Auth {
  /** Implementation id. */
  static readonly id = IMPLEMENTATION_IDS.localTokenAuth

  private readonly token: string
  private port: number

  /**
   * @param ctx Service context; `options` is {@link LocalTokenAuthOptions}.
   */
  constructor(ctx: ServiceContext) {
    const opts = (ctx.options ?? {}) as Partial<LocalTokenAuthOptions>
    if (!opts.token) {
      throw new Error("LocalTokenAuth requires options.token.")
    }
    this.token = opts.token
    this.port = opts.port ?? 0
  }

  /** Update the expected port after the server binds (port 0). */
  setPort(port: number): void {
    this.port = port
  }

  /**
   * Allow the request when the bearer token and Host/Origin headers match.
   */
  async authenticate(request: {
    headers: Record<string, string | undefined>
  }): Promise<{ principal: "local" } | undefined> {
    const authorization = header(request.headers, "authorization")
    if (!authorization || !authorization.startsWith("Bearer ")) return undefined
    const presented = authorization.slice("Bearer ".length)
    if (!tokensEqual(presented, this.token)) return undefined

    const host = header(request.headers, "host")
    if (!host || !isAllowedHost(host, this.port)) return undefined

    const origin = header(request.headers, "origin")
    if (origin !== undefined && origin !== "" && !isAllowedOrigin(origin, this.port)) {
      return undefined
    }
    return { principal: "local" }
  }
}

/**
 * Constant-time string compare for tokens of equal length.
 * @category Host
 */
export function tokensEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/**
 * Whether `Host` is loopback for the listen port.
 * @category Host
 */
export function isAllowedHost(hostHeader: string, port: number): boolean {
  const normalized = hostHeader.trim().toLowerCase()
  return normalized === `127.0.0.1:${port}` || normalized === `localhost:${port}`
}

/**
 * Whether `Origin` is loopback HTTP for the listen port.
 * @category Host
 */
export function isAllowedOrigin(origin: string, port: number): boolean {
  const normalized = origin.trim().toLowerCase()
  return (
    normalized === `http://127.0.0.1:${port}` || normalized === `http://localhost:${port}`
  )
}

function header(
  headers: Record<string, string | undefined>,
  name: string,
): string | undefined {
  const direct = headers[name] ?? headers[name.toLowerCase()]
  if (direct !== undefined) return direct
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name.toLowerCase()) return value
  }
  return undefined
}
