/**
 * Default loopback bind for `ecp app`.
 * @category App
 */
export const DEFAULT_APP_HOST = "127.0.0.1"

/**
 * Query parameter carrying the pairing token (`http://127.0.0.1:<port>/?token=`).
 * @category App
 */
export const APP_TOKEN_QUERY = "token"

/**
 * Authorization header prefix for App HTTP/WS requests.
 * @category App
 */
export const APP_BEARER_PREFIX = "Bearer "

/**
 * File-change debounce used by `plugin-app` (`fs.watch`).
 * @category App
 */
export const APP_WATCH_DEBOUNCE_MS = 150
