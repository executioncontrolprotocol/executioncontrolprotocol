import { describe, it, expect } from "vitest";
import { validateOutput } from "@ecp/runtime";
import type { SchemaDefinition } from "@ecp/spec";

const planSchema: SchemaDefinition = {
  type: "object",
  required: ["selectedIds", "delegate"],
  properties: {
    selectedIds: { type: "array", items: { type: "string" } },
    delegate: {
      type: "array",
      items: {
        type: "object",
        required: ["executor", "task"],
        properties: {
          executor: { type: "string" },
          task: { type: "string" },
        },
      },
    },
  },
};

describe("Schema validator", () => {
  it("validates a conforming object", () => {
    const result = validateOutput(
      {
        selectedIds: ["ID-1", "ID-2"],
        delegate: [{ executor: "analyst", task: "Analyze items" }],
      },
      planSchema,
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects an object missing required fields", () => {
    const result = validateOutput({ selectedIds: [] }, planSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes("delegate"))).toBe(true);
  });

  it("rejects wrong types", () => {
    const result = validateOutput(
      { selectedIds: "not-an-array", delegate: [] },
      planSchema,
    );
    expect(result.valid).toBe(false);
  });

  it("allows additional properties", () => {
    const result = validateOutput(
      {
        selectedIds: [],
        delegate: [],
        extraField: "should be allowed",
      },
      planSchema,
    );
    expect(result.valid).toBe(true);
  });

  it("validates nested objects in delegate array", () => {
    const result = validateOutput(
      {
        selectedIds: [],
        delegate: [{ executor: "a", task: "b", hints: { priority: 1 } }],
      },
      planSchema,
    );
    expect(result.valid).toBe(true);
  });

  it("rejects delegate items missing required fields", () => {
    const result = validateOutput(
      {
        selectedIds: [],
        delegate: [{ executor: "a" }],
      },
      planSchema,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("task"))).toBe(true);
  });
});
