import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { listTraceIds } from "../src/lib/trace-files.js";

describe("trace-files", () => {
  it("lists trace ids from *.json files (sorted)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ecp-traces-"));
    writeFileSync(join(dir, "run-b.json"), "{}");
    writeFileSync(join(dir, "run-a.json"), "{}");
    writeFileSync(join(dir, "not-a-trace.txt"), "x");

    const ids = await listTraceIds(dir);
    expect(ids).toEqual(["run-a", "run-b"]);
  });

  it("throws if the directory does not exist", async () => {
    const ids = await listTraceIds(join(tmpdir(), "ecp-traces-does-not-exist-xyz"));
    expect(ids).toEqual([]);
  });
});

