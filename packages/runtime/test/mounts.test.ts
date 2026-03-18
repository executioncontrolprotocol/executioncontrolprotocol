import { describe, it, expect, beforeEach } from "vitest";
import { MockToolInvoker } from "../src/testing/mock-tool-invoker.js";
import { DefaultMountHydrator, resolveSelector } from "../src/mounts/hydrator.js";
import { interpolateString, interpolateArgs } from "../src/mounts/interpolation.js";
import type { Mount } from "@executioncontrolprotocol/spec";

describe("Template interpolation", () => {
  it("interpolates ${inputs.*} expressions", () => {
    const result = interpolateString(
      "${inputs.projectId} / ${inputs.limit}",
      { inputs: { projectId: "PROJ-1", limit: 50 } },
    );
    expect(result).toBe("PROJ-1 / 50");
  });

  it("interpolates ${item} for focus/deep mounts", () => {
    const result = interpolateString("Issue ${item}", {
      inputs: {},
      item: "ISSUE-42",
    });
    expect(result).toBe("Issue ISSUE-42");
  });

  it("returns empty string for unknown expressions", () => {
    expect(interpolateString("${unknown.thing}", { inputs: {} })).toBe("");
  });

  it("deep-interpolates nested args objects", () => {
    const result = interpolateArgs(
      { project: "${inputs.project}", nested: { id: "${item}" } },
      { inputs: { project: "OPS" }, item: "42" },
    );
    expect(result).toEqual({ project: "OPS", nested: { id: "42" } });
  });
});

describe("Selector resolution", () => {
  const planOutput = {
    selectedIssueIds: ["ISS-1", "ISS-2", "ISS-3", "ISS-4", "ISS-5"],
    nested: { ids: ["A", "B"] },
  };

  it("resolves a top-level array selector", () => {
    const result = resolveSelector("selectedIssueIds", planOutput);
    expect(result.ids).toEqual(["ISS-1", "ISS-2", "ISS-3", "ISS-4", "ISS-5"]);
    expect(result.wasCapped).toBe(false);
  });

  it("resolves a nested dot-path selector", () => {
    const result = resolveSelector("nested.ids", planOutput);
    expect(result.ids).toEqual(["A", "B"]);
  });

  it("caps results with maxSelected", () => {
    const result = resolveSelector("selectedIssueIds", planOutput, 3);
    expect(result.ids).toEqual(["ISS-1", "ISS-2", "ISS-3"]);
    expect(result.wasCapped).toBe(true);
    expect(result.originalCount).toBe(5);
  });

  it("returns empty for non-existent path", () => {
    const result = resolveSelector("does.not.exist", planOutput);
    expect(result.ids).toEqual([]);
  });

  it("returns empty for non-array value", () => {
    const result = resolveSelector("nested", planOutput);
    expect(result.ids).toEqual([]);
  });
});

describe("Mount hydrator", () => {
  let toolInvoker: MockToolInvoker;
  let hydrator: DefaultMountHydrator;

  beforeEach(() => {
    toolInvoker = new MockToolInvoker();
    hydrator = new DefaultMountHydrator(toolInvoker);
  });

  const seedMount: Mount = {
    name: "issues_seed",
    stage: "seed",
    from: { server: "jira", tool: "issues.search", args: { project: "${inputs.project}" } },
    limits: { maxItems: 3 },
  };

  const focusMount: Mount = {
    name: "issue_details",
    stage: "focus",
    when: { selectorFrom: "selectedIssueIds", maxSelected: 2 },
    from: { server: "jira", tool: "issues.get", args: { issueId: "${item}" } },
    limits: { maxItems: 2 },
  };

  it("hydrates seed mounts via tool invoker", async () => {
    toolInvoker.addSimpleTool("jira", "issues.search", [
      { id: "ISS-1", title: "Bug" },
      { id: "ISS-2", title: "Feature" },
      { id: "ISS-3", title: "Task" },
      { id: "ISS-4", title: "Epic" },
    ]);

    const results = await hydrator.hydrateStage(
      [seedMount],
      "seed",
      { project: "OPS" },
    );

    expect(results).toHaveLength(1);
    expect(results[0].mountName).toBe("issues_seed");
    expect(results[0].stage).toBe("seed");
    expect(results[0].itemCount).toBe(3);
    expect(toolInvoker.calls).toHaveLength(1);
    expect(toolInvoker.calls[0].args.project).toBe("OPS");
  });

  it("enforces maxItems on seed mount data", async () => {
    toolInvoker.addSimpleTool("jira", "issues.search", [1, 2, 3, 4, 5]);
    const results = await hydrator.hydrateStage([seedMount], "seed", {});
    expect((results[0].data as unknown[]).length).toBe(3);
  });

  it("hydrates focus mounts using plan selectors", async () => {
    toolInvoker
      .addSimpleTool("jira", "issues.get", { id: "ISS-1", detail: "full" })
      .addSimpleTool("jira", "issues.get", { id: "ISS-2", detail: "full" });

    const plan = { selectedIssueIds: ["ISS-1", "ISS-2", "ISS-3"] };

    const results = await hydrator.hydrateStage(
      [focusMount],
      "focus",
      {},
      plan,
    );

    expect(results).toHaveLength(1);
    expect(results[0].stage).toBe("focus");
    expect(toolInvoker.calls).toHaveLength(2);
  });

  it("skips mounts for non-matching stage", async () => {
    toolInvoker.addSimpleTool("jira", "issues.search", []);
    const results = await hydrator.hydrateStage([seedMount], "focus", {});
    expect(results).toHaveLength(0);
  });

  it("returns empty data on tool error", async () => {
    toolInvoker.addTool("jira", {
      name: "issues.search",
      description: "",
      inputSchema: {},
      responses: [{ content: "error", isError: true }],
    });

    const results = await hydrator.hydrateStage([seedMount], "seed", {});
    expect(results[0].itemCount).toBe(0);
  });
});
