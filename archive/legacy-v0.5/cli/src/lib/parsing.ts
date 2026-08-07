import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { commandErrorMessage } from "./command-helpers.js";

export type InputValue = string | number | boolean;

/**
 * Parse `--input key=value` occurrences.
 * - `true`/`false` become booleans
 * - numeric-looking values become numbers
 * - everything else stays a string
 */
export function parseKeyValueInputs(
  raw: string[] | undefined,
  flagName = "--input",
): Record<string, InputValue> {
  const inputs: Record<string, InputValue> = {};
  for (const kv of raw ?? []) {
    const eqIdx = kv.indexOf("=");
    if (eqIdx === -1) {
      throw new Error(`Invalid ${flagName} value "${kv}" (expected key=value).`);
    }

    const key = kv.slice(0, eqIdx).trim();
    const valueRaw = kv.slice(eqIdx + 1);
    if (!key) {
      throw new Error(`Invalid ${flagName} value "${kv}" (missing key).`);
    }

    if (valueRaw === "true") inputs[key] = true;
    else if (valueRaw === "false") inputs[key] = false;
    else if (!isNaN(Number(valueRaw)) && valueRaw !== "") inputs[key] = Number(valueRaw);
    else inputs[key] = valueRaw;
  }
  return inputs;
}

export function splitCommaSeparated(raw: string[] | undefined): string[] {
  const out: string[] = [];
  for (const v of raw ?? []) {
    out.push(...v.split(",").map((s) => s.trim()).filter(Boolean));
  }
  return out;
}

export function parseJsonObject<T = unknown>(raw: string | undefined, flagName: string): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(`Invalid ${flagName}: ${commandErrorMessage(err)}`);
  }
}

export function resolveAndValidatePath(pathRaw: string, flagName: string): string {
  const p = resolve(pathRaw);
  if (!existsSync(p)) {
    throw new Error(`Invalid ${flagName}: file not found at ${p}`);
  }
  return p;
}

