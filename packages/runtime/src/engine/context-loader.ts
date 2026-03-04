/**
 * Context loader — reads and validates ECP Context manifests from
 * YAML or JSON files.
 *
 * @category Engine
 */

import { readFileSync } from "node:fs";
import { extname } from "node:path";
import yaml from "js-yaml";
import type { ECPContext } from "@ecp/spec";

/**
 * Load an ECP Context manifest from a YAML or JSON file.
 *
 * @param filePath - Absolute or relative path to the manifest.
 * @returns The parsed Context object.
 * @throws If the file cannot be read or parsed.
 *
 * @category Engine
 */
export function loadContext(filePath: string): ECPContext {
  const raw = readFileSync(filePath, "utf-8");
  const ext = extname(filePath).toLowerCase();

  let parsed: unknown;
  if (ext === ".yaml" || ext === ".yml") {
    parsed = yaml.load(raw);
  } else if (ext === ".json") {
    parsed = JSON.parse(raw);
  } else {
    parsed = yaml.load(raw);
  }

  const ctx = parsed as ECPContext;

  if (!ctx || typeof ctx !== "object") {
    throw new Error(`Failed to parse Context from ${filePath}: not an object`);
  }
  if (ctx.kind !== "Context") {
    throw new Error(
      `Invalid Context: expected kind "Context", got "${ctx.kind}"`,
    );
  }
  if (!ctx.metadata?.name) {
    throw new Error("Invalid Context: missing metadata.name");
  }
  if (!ctx.orchestration?.entrypoint) {
    throw new Error("Invalid Context: missing orchestration.entrypoint");
  }
  if (!ctx.executors?.length) {
    throw new Error("Invalid Context: no executors defined");
  }

  return ctx;
}

/**
 * Resolve input values for a Context run. Applies defaults for
 * missing optional inputs and validates that all required inputs
 * are provided.
 *
 * @param context - The loaded Context.
 * @param supplied - Input values supplied by the caller.
 * @returns Fully resolved input values.
 * @throws If a required input is missing.
 *
 * @category Engine
 */
export function resolveInputs(
  context: ECPContext,
  supplied: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  const resolved: Record<string, string | number | boolean> = {};
  const definitions = context.inputs ?? {};

  for (const [name, def] of Object.entries(definitions)) {
    if (name in supplied) {
      resolved[name] = supplied[name];
    } else if (def.default !== undefined) {
      resolved[name] = def.default;
    } else if (def.required) {
      throw new Error(`Missing required input: "${name}"`);
    }
  }

  return resolved;
}
