import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, it, expect, vi, beforeEach } from "vitest";

const fsActual = await vi.importActual<typeof import("node:fs")>("node:fs");

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
  };
});

import { readFileSync } from "node:fs";

import { CONFIG_JSON_STDIN_FILE, readJsonFromFile } from "../src/lib/config-cli-json.js";

describe("readJsonFromFile", () => {
  const readFileSyncMock = vi.mocked(readFileSync);

  beforeEach(() => {
    readFileSyncMock.mockImplementation(fsActual.readFileSync);
  });

  it("reads stdin when --file is dash", () => {
    readFileSyncMock.mockImplementation((path: Parameters<typeof readFileSync>[0], ...rest) => {
      if (path === 0) return '{"b":2}';
      return fsActual.readFileSync(path, ...rest);
    });
    expect(readJsonFromFile(CONFIG_JSON_STDIN_FILE)).toEqual({ b: 2 });
    expect(readFileSyncMock).toHaveBeenCalledWith(0, "utf-8");
  });

  it("reads a real file path", () => {
    const dir = mkdtempSync(join(tmpdir(), "ecp-json-"));
    const fp = join(dir, "blob.json");
    writeFileSync(fp, '{"d":4}', "utf-8");
    expect(readJsonFromFile(fp)).toEqual({ d: 4 });
  });

  it("throws on invalid JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "ecp-json-"));
    const fp = join(dir, "bad.json");
    writeFileSync(fp, "not json", "utf-8");
    expect(() => readJsonFromFile(fp)).toThrow(/Invalid JSON/);
  });
});
