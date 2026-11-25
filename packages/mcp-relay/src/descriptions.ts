/**
 * Normative MCP tool descriptions (spec 09). Keep wording changes intentional — snapshot-tested.
 * @category MCP
 */
export const RETRIEVE_DESCRIPTION = [
  "Read ECP objects from the local host: capabilities, executions, configs, runs, plugins, formatters, or editor schema files (type schema).",
  "Use retrieve to discover capabilities and their accepts/returns schemas before calling execute.",
  "For type schema, the default item is the root execution.schema.json path; include [\"document\"] inlines JSON up to 256 KiB; use output.path for large plugin schemas.",
  "Prefer id for an exact capability or object; use query/filter/limit for lists (not for type schema).",
  "Secrets are never returned; configure secrets with `ecp config secrets set` and config objects, not through MCP.",
].join(" ")

/**
 * @category MCP
 */
export const EXECUTE_DESCRIPTION = [
  "Validate or run an execution on the local host.",
  "Fix loop: call with mode \"validate\", read issues from the result, fix the manifest, and repeat until valid; then run.",
  "Prefer execution.path for local *.ecp.json files (paths are resolved against the relay cwd).",
  "You may also pass an inline manifest, { id }, or { id, patch } for an unsaved variant.",
  "Use output.path for large results (path relative to cwd); the tool then returns a summary.",
  "If a run is interrupted after a host restart, call execute again with resume set to the runId.",
  "Never pass secret values here — use `ecp config secrets set` and config objects with $secret references.",
].join(" ")

/**
 * @category MCP
 */
export const COMMIT_DESCRIPTION = [
  "Create, update, or delete a stored execution or config on the local host.",
  "Use ifVersion on updates to avoid overwriting concurrent changes.",
  "Secrets are never passed through this tool — store values with `ecp config secrets set` and reference them from config objects.",
].join(" ")
