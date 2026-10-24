import { describe, expect, it } from "vitest"
import { COMMANDS, McpServeCommand } from "../src/oclif.js"

describe("mcp serve command", () => {
  it("registers mcp:serve with stdio and --tools meta", () => {
    expect(COMMANDS["mcp:serve"]).toBe(McpServeCommand)
    expect(McpServeCommand.id).toBe("mcp:serve")
    expect(McpServeCommand.flags.tools.options).toEqual(["all", "meta"])
    expect(McpServeCommand.flags.stdio.default).toBe(true)
  })
})
