import { createRequire } from "node:module"

/**
 * Package version of `@executioncontrolprotocol/protocol` from its `package.json`.
 * @category Definitions
 */
export const PROTOCOL_VERSION: string = (
  createRequire(import.meta.url)("../package.json") as { version: string }
).version

/** Document `schema` value for an execution manifest. @category Definitions */
export const EXECUTION_SCHEMA = "@executioncontrolprotocol.execution"

/** Document `version` value for an execution manifest. @category Definitions */
export const EXECUTION_VERSION = "2.0"

/** Document `schema` value for a config object. @category Definitions */
export const CONFIG_SCHEMA = "@executioncontrolprotocol.config"

/** Document `version` value for a config object. @category Definitions */
export const CONFIG_VERSION = "1.0"

/** Document `schema` value for a run record. @category Definitions */
export const RUN_SCHEMA = "@executioncontrolprotocol.run"

/** Document `version` value for a run record. @category Definitions */
export const RUN_VERSION = "1.0"

/** Document `schema` value for a plugin manifest. @category Definitions */
export const PLUGIN_MANIFEST_SCHEMA = "@executioncontrolprotocol.plugin-manifest"

/** Document `version` value for a plugin manifest. @category Definitions */
export const PLUGIN_MANIFEST_VERSION = "2.0"

/** Document `schema` value for `host.json`. @category Definitions */
export const HOST_SCHEMA = "@executioncontrolprotocol.host"

/** Document `version` value for `host.json`. @category Definitions */
export const HOST_VERSION = "1.0"

/** `execution.id` pattern. @category Definitions */
export const EXECUTION_ID_PATTERN = "^[a-z0-9][a-z0-9-]{0,63}$"

/** Node `id` pattern, unique across the whole document. @category Definitions */
export const NODE_ID_PATTERN = "^[A-Za-z][A-Za-z0-9_-]{0,63}$"

/** State key written by `as`. @category Definitions */
export const STATE_KEY_PATTERN = "^[A-Za-z_][A-Za-z0-9_]*$"

/** Capability id `@scope/name.capability`. @category Definitions */
export const CAPABILITY_ID_PATTERN =
  "^@[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*\\.[A-Za-z0-9][A-Za-z0-9._-]*$"

/** Config object name segment. @category Definitions */
export const CONFIG_NAME_PATTERN = "^[a-z0-9][a-z0-9-]{0,63}$"

/** Secret key pattern. @category Definitions */
export const SECRET_KEY_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$"

/** `$ref` path: `state` plus one or more segments. @category Definitions */
export const REF_PATH_PATTERN = "^state(?:\\.(?:[A-Za-z_$][A-Za-z0-9_$-]*|[0-9]+))+$"

/** `$state` path: the same segments without the `state.` prefix. @category Definitions */
export const STATE_PATH_PATTERN = "^(?:[A-Za-z_$][A-Za-z0-9_$-]*|[0-9]+)(?:\\.(?:[A-Za-z_$][A-Za-z0-9_$-]*|[0-9]+))*$"

/** Default formatter id. @category Definitions */
export const DEFAULT_FORMATTER_ID = "@executioncontrolprotocol/formatters.json"

/** Expression evaluation budget in milliseconds. @category Definitions */
export const EXPR_BUDGET_MS = 50

/** Transform script evaluation budget in milliseconds. @category Definitions */
export const TRANSFORM_BUDGET_MS = 1000

/** Transform script memory cap in bytes. @category Definitions */
export const TRANSFORM_MEMORY_BYTES = 32 * 1024 * 1024

/** Transform script maximum JSON result size in bytes. @category Definitions */
export const TRANSFORM_MAX_RESULT_BYTES = 4 * 1024 * 1024

/** Maximum editor schema bytes returned inline on `retrieve` type `schema` with `include: ["document"]`. @category Definitions */
export const SCHEMA_DOCUMENT_INLINE_MAX_BYTES = 262_144

/** `forEach` loop `concurrency` upper bound. @category Definitions */
export const MAX_LOOP_CONCURRENCY = 32

/** Maximum items in one `forEach` loop at run time. @category Definitions */
export const MAX_LOOP_ITEMS = 10000
