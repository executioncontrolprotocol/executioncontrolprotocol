import { homedir } from "node:os";
import { resolve } from "node:path";

export function getEcpHomeDir(): string {
  return resolve(homedir(), ".ecp");
}

export function getDefaultTraceDir(): string {
  return resolve(getEcpHomeDir(), "traces");
}

