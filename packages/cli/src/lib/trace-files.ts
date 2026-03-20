import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export async function listTraceIds(traceDirRaw: string): Promise<string[]> {
  const traceDir = resolve(traceDirRaw);
  if (!existsSync(traceDir)) return [];

  const entries = await readdir(traceDir, { withFileTypes: true });
  const ids = entries
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => e.name.slice(0, -".json".length));

  return ids.sort();
}

