import { DEFAULT_APP_HOST } from "@executioncontrolprotocol/app"

/**
 * Default HTTP bind address for `ecp app` (loopback only).
 * @category App
 */
export const DEFAULT_PLUGIN_APP_HOST = DEFAULT_APP_HOST

/**
 * Cookie that carries the pairing token after the first authenticated HTML load.
 * @category App
 */
export const APP_TOKEN_COOKIE = "ecp-app-token"

/**
 * Ephemeral port (`0`) so tests and concurrent `ecp app` sessions do not collide.
 * @category App
 */
export const DEFAULT_PLUGIN_APP_PORT = 0
