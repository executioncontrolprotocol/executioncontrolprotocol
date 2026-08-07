import { readFileSync } from "node:fs";

import { commandErrorMessage } from "./command-helpers.js";

/**
 * Stdin marker for `--file` (avoids cmd.exe/npm `.cmd` shims mangling inline JSON on Windows).
 *
 * @category Config CLI
 */
export const CONFIG_JSON_STDIN_FILE = "-";

/**
 * Read and parse JSON from `--file` (path or stdin when `file` is {@link CONFIG_JSON_STDIN_FILE}).
 *
 * @category Config CLI
 */
export function readJsonFromFile(file: string): unknown {
  const raw =
    file === CONFIG_JSON_STDIN_FILE ? readFileSync(0, "utf-8") : readFileSync(file, "utf-8");
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON: ${commandErrorMessage(e)}`);
  }
}
