import { describe, it, expect } from "vitest";

import type { ECPContext } from "@executioncontrolprotocol/spec";

import { parseKeyValueInputs, splitCommaSeparated, parseJsonObject } from "../src/lib/parsing.js";
import { getRequiredInputNames } from "../src/lib/inputs.js";

describe("CLI parsing helpers", () => {
  it("parses key=value inputs and converts booleans/numbers", () => {
    const inputs = parseKeyValueInputs(["a=true", "b=false", "c=123", "d=hello"], "--input");
    expect(inputs).toEqual({ a: true, b: false, c: 123, d: "hello" });
  });

  it("returns empty object when no inputs are provided", () => {
    const inputs = parseKeyValueInputs(undefined, "--input");
    expect(inputs).toEqual({});
  });

  it("throws on invalid input format", () => {
    expect(() => parseKeyValueInputs(["no-equals"], "--input")).toThrow(/expected key=value/i);
  });

  it("splits comma-separated list across multiple occurrences", () => {
    const out = splitCommaSeparated(["a,b", "c", ""]);
    expect(out).toEqual(["a", "b", "c"]);
  });

  it("parses JSON objects and throws on invalid JSON", () => {
    const obj = parseJsonObject<{ x: number }>('{"x": 1}', "--json-flag");
    expect(obj).toEqual({ x: 1 });

    expect(() => parseJsonObject("{not-json}", "--json-flag")).toThrow(/Invalid --json-flag/i);
  });

  it("extracts required input names from Context", () => {
    const ctx = {
      inputs: {
        a: { type: "string", required: true },
        b: { type: "number" },
        c: { type: "boolean", required: false },
      },
    } as unknown as ECPContext;

    const required = getRequiredInputNames(ctx);
    expect(required).toEqual(["a"]);
  });
});

