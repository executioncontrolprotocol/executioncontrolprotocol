import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContext, resolveInputs } from "@executioncontrolprotocol/runtime";

const fixtures = resolve(import.meta.dirname, "fixtures");

describe("Context loader", () => {
  describe("valid contexts", () => {
    it("loads a minimal context", () => {
      const ctx = loadContext(resolve(fixtures, "valid/minimal.yaml"));
      expect(ctx.kind).toBe("Context");
      expect(ctx.metadata.name).toBe("minimal");
      expect(ctx.orchestration.entrypoint).toBe("agent");
      expect(ctx.executors).toHaveLength(1);
    });

    it("loads a full-featured context with all fields", () => {
      const ctx = loadContext(resolve(fixtures, "valid/full-featured.yaml"));
      expect(ctx.metadata.name).toBe("full-featured");
      expect(ctx.orchestration?.strategy).toBe("delegate");
      expect(ctx.executors).toHaveLength(3);
      expect(ctx.inputs).toBeDefined();
      expect(ctx.schemas).toBeDefined();
      expect(ctx.triggers).toHaveLength(1);
      expect(ctx.outputs).toHaveLength(1);
    });

    it("loads the canonical spec.yaml", () => {
      const ctx = loadContext(resolve(fixtures, "../../../../spec.yaml"));
      expect(ctx.metadata.name).toBe("weekly-ecom-ops");
      expect(ctx.executors).toHaveLength(4);
    });

    it("loads example single-executor context", () => {
      const ctx = loadContext(
        resolve(fixtures, "../../../../examples/single-executor/context.yaml"),
      );
      expect(ctx.orchestration.strategy).toBe("single");
      expect(ctx.executors).toHaveLength(1);
    });

    it("loads example controller-specialist context", () => {
      const ctx = loadContext(
        resolve(fixtures, "../../../../examples/controller-specialist/context.yaml"),
      );
      expect(ctx.orchestration?.strategy).toBe("delegate");
      expect(ctx.executors.length).toBeGreaterThanOrEqual(3);
    });

    it("loads a context that uses top-level orchestrator", () => {
      const ctx = loadContext(resolve(fixtures, "valid/orchestrator-root.yaml"));
      expect(ctx.orchestrator?.name).toBe("root");
      expect(ctx.orchestrator?.executors).toHaveLength(1);
      expect(ctx.orchestration).toBeUndefined();
    });
  });

  describe("invalid contexts", () => {
    it("rejects a context with missing kind", () => {
      expect(() =>
        loadContext(resolve(fixtures, "invalid/missing-kind.yaml")),
      ).toThrow(/kind/i);
    });

    it("rejects a context with missing specVersion", () => {
      expect(() =>
        loadContext(resolve(fixtures, "invalid/missing-spec-version.yaml")),
      ).toThrow(/specVersion/i);
    });

    it("rejects a context with no executors", () => {
      expect(() =>
        loadContext(resolve(fixtures, "invalid/no-executors.yaml")),
      ).toThrow(/execution object/i);
    });

    it("rejects a non-existent file", () => {
      expect(() => loadContext("/tmp/does-not-exist.yaml")).toThrow();
    });
  });
});

describe("Input resolution", () => {
  const ctx = loadContext(resolve(fixtures, "valid/full-featured.yaml"));

  it("resolves required inputs when provided", () => {
    const resolved = resolveInputs(ctx, { projectId: "PROJ-1" });
    expect(resolved.projectId).toBe("PROJ-1");
  });

  it("applies default values for optional inputs", () => {
    const resolved = resolveInputs(ctx, { projectId: "PROJ-1" });
    expect(resolved.limit).toBe(50);
  });

  it("allows overriding defaults", () => {
    const resolved = resolveInputs(ctx, { projectId: "PROJ-1", limit: 10 });
    expect(resolved.limit).toBe(10);
  });

  it("throws when a required input is missing", () => {
    expect(() => resolveInputs(ctx, {})).toThrow(/required.*projectId/i);
  });
});
