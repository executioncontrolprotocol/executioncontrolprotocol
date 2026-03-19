import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve } from "node:path";
import { MCPToolInvoker } from "../../src/protocols/mcp/mcp-tool-invoker.js";

const FAKE_SERVER_PATH = resolve(
  import.meta.dirname,
  "servers/fake-mcp-server.ts",
);

describe("MCP integration — real protocol, fake server", () => {
  let invoker: MCPToolInvoker;

  beforeAll(async () => {
    invoker = new MCPToolInvoker();
    await invoker.connect({
      name: "test-jira",
      transport: {
        type: "stdio",
        command: "npx",
        args: ["tsx", FAKE_SERVER_PATH],
      },
    });
  }, 30_000);

  afterAll(async () => {
    await invoker.disconnectAll();
  }, 30_000);

  it("discovers tools from the fake MCP server", async () => {
    const tools = await invoker.listTools("test-jira");
    expect(tools.length).toBeGreaterThanOrEqual(2);

    const names = tools.map((t) => t.name);
    expect(names).toContain("issues.search");
    expect(names).toContain("issues.get");
  });

  it("calls issues.search and gets deterministic results", async () => {
    const result = await invoker.callTool("test-jira", "issues.search", {
      project: "OPS",
      limit: 2,
    });

    expect(result.isError).toBe(false);
    const data = result.content as Array<{ id: string; title: string }>;
    expect(data).toHaveLength(2);
    expect(data[0].id).toBe("ISS-1");
    expect(data[1].id).toBe("ISS-2");
  });

  it("calls issues.get with a valid ID", async () => {
    const result = await invoker.callTool("test-jira", "issues.get", {
      issueId: "ISS-1",
    });

    expect(result.isError).toBe(false);
    const data = result.content as { id: string; description: string };
    expect(data.id).toBe("ISS-1");
    expect(data.description).toContain("mobile");
  });

  it("returns error for unknown issue ID", async () => {
    const result = await invoker.callTool("test-jira", "issues.get", {
      issueId: "DOES-NOT-EXIST",
    });

    expect(result.isError).toBe(true);
  });

  it("returns error for unknown tool", async () => {
    const result = await invoker.callTool("test-jira", "unknown.tool", {});
    expect(result.isError).toBe(true);
  });

  it("throws for unconnected server", async () => {
    await expect(
      invoker.callTool("not-connected", "tool", {}),
    ).rejects.toThrow(/not connected/i);
  });
});
