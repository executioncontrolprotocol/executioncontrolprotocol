/**
 * Built-in file progress logger — appends execution progress events to a log file
 * in the user's ECP config directory (~/.ecp/logs by default).
 *
 * @category Extensions
 */

import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import type { ExecutionProgressEvent, ProgressCallback } from "../../engine/types.js";

/**
 * Configuration for the file progress logger.
 *
 * @category Extensions
 */
export interface FileProgressLoggerConfig {
  /**
   * Directory for log files. Defaults to ~/.ecp/logs.
   */
  logDir?: string;

  /**
   * Log file name. Defaults to ecp.log.
   */
  logFile?: string;
}

const DEFAULT_LOG_DIR = "logs";
const DEFAULT_LOG_FILE = "ecp.log";

function getLogPath(config: FileProgressLoggerConfig = {}): string {
  const base = config.logDir ?? resolve(homedir(), ".ecp", DEFAULT_LOG_DIR);
  const file = config.logFile ?? DEFAULT_LOG_FILE;
  return resolve(base, file);
}

function formatEvent(event: ExecutionProgressEvent): string {
  const ts = new Date().toISOString();
  switch (event.type) {
    case "phase":
      return `${ts} [phase] ${event.status}\n`;
    case "step_start":
      return `${ts} [step_start] step=${event.step} kind=${event.kind} ${event.executorName ?? ""} ${event.description}\n`;
    case "step_complete":
      const tokens = event.tokens
        ? ` tokens=${event.tokens.prompt}+${event.tokens.completion}=${event.tokens.total}`
        : "";
      const out = event.output !== undefined ? " output=true" : "";
      return `${ts} [step_complete] step=${event.step} kind=${event.kind} ${event.executorName ?? ""} ${event.durationMs}ms${tokens}${out}\n`;
    case "executor_reasoning":
      return `${ts} [reasoning] ${event.executorName} ${event.reasoning.slice(0, 80).replace(/\n/g, " ")}...\n`;
    default:
      return `${ts} [${(event as { type: string }).type}]\n`;
  }
}

/**
 * Create a progress callback that appends each event to a log file in the user directory.
 */
export function createFileProgressLogger(
  config: FileProgressLoggerConfig = {},
): ProgressCallback {
  const logPath = getLogPath(config);
  const dir = dirname(logPath);

  return (event: ExecutionProgressEvent) => {
    try {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      appendFileSync(logPath, formatEvent(event), "utf-8");
    } catch {
      // Ignore write errors so the run is not broken.
    }
  };
}
