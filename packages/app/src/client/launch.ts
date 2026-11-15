/**
 * What the App was opened with: `ecp app` puts these in the URL fragment.
 * @category App
 */
export interface AppLaunchParams {
  /** Host bearer token. */
  token?: string
  /** Absolute path of an execution file to open. */
  open?: string
  /** Saved execution id to open. */
  id?: string
  /** Absolute directory whose `*.ecp.json` files the home view lists. */
  dir?: string
}

/**
 * `sessionStorage` key holding the host token.
 * @category App
 */
export const TOKEN_STORAGE_KEY = "ecp.token"

const LAUNCH_KEYS = ["token", "open", "id", "dir"] as const

/**
 * Minimal storage surface (`sessionStorage` in the browser).
 * @category App
 */
export interface TokenStorage {
  /** Read a value. */
  getItem(key: string): string | null
  /** Write a value. */
  setItem(key: string, value: string): void
}

/**
 * Parse `#token=…&open=…&id=…&dir=…` (leading `#` optional). Empty values are dropped.
 * @category App
 */
export function parseLaunchFragment(hash: string): AppLaunchParams {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash)
  const out: AppLaunchParams = {}
  for (const key of LAUNCH_KEYS) {
    const value = params.get(key)
    if (value) out[key] = value
  }
  return out
}

/**
 * Resolve launch parameters: a fragment token is saved to `storage`; without one, the
 * stored token is used.
 * @category App
 */
export function resolveLaunch(hash: string, storage: TokenStorage): AppLaunchParams {
  const params = parseLaunchFragment(hash)
  if (params.token) {
    storage.setItem(TOKEN_STORAGE_KEY, params.token)
    return params
  }
  const stored = storage.getItem(TOKEN_STORAGE_KEY)
  return stored ? { ...params, token: stored } : params
}

/**
 * Fragment to keep in the address bar once the token is stored: the same parameters
 * without `token`, or an empty string when nothing remains.
 * @category App
 */
export function fragmentWithoutToken(params: AppLaunchParams): string {
  const search = new URLSearchParams()
  for (const key of LAUNCH_KEYS) {
    const value = params[key]
    if (key !== "token" && value) search.set(key, value)
  }
  const text = search.toString()
  return text ? `#${text}` : ""
}
