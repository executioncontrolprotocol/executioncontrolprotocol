import type { Command } from "@oclif/core";

/** Suffix when the resolved config path has no file yet (most `ecp config * get` commands). */
export const CONFIG_FILE_HEADER_WHEN_MISSING = " (no file — empty)";

/** Suffix for `ecp config get` when dumping full resolved config. */
export const CONFIG_DUMP_HEADER_WHEN_MISSING = " (empty — no file yet)";

export function commandErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Runs `fn` and maps any thrown value to `cmd.error` with exit code 1.
 * Use after `parse()` so flag validation errors are not swallowed.
 */
export async function runWithCommandError(
  cmd: Command,
  fn: () => void | Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    cmd.error(commandErrorMessage(err), { exit: 1 });
  }
}

/**
 * First line for commands that show config loaded via {@link loadConfigForDisplay}.
 */
export function formatConfigFileHeaderLine(
  path: string,
  exists: boolean,
  whenMissing: string = CONFIG_FILE_HEADER_WHEN_MISSING,
): string {
  const suffix = exists ? "" : whenMissing;
  return `# ${path}${suffix}\n`;
}
