import { describe, it, expect } from "vitest";
import { extractToolServerSpecsFromArgv, parseToolServerSpecs } from "../src/tool-servers.js";

describe("parseToolServerSpecs", () => {
  it("parses stdio specs with comma args", () => {
    const cfg = parseToolServerSpecs([
      "fetch=stdio:docker,run,-i,--rm,mcp/fetch",
    ]);
    expect(cfg.fetch.transport.type).toBe("stdio");
    expect(cfg.fetch.transport.command).toBe("docker");
    expect(cfg.fetch.transport.args).toEqual(["run", "-i", "--rm", "mcp/fetch"]);
  });

  it("parses sse specs", () => {
    const cfg = parseToolServerSpecs([
      "remote=sse:https://example.com/sse",
    ]);
    expect(cfg.remote.transport).toEqual({
      type: "sse",
      url: "https://example.com/sse",
    });
  });

  it("throws on invalid specs", () => {
    expect(() => parseToolServerSpecs(["bad"])).toThrow(/expected name=/i);
    expect(() => parseToolServerSpecs(["x=unknown:thing"])).toThrow(/unknown transport/i);
  });
});

describe("extractToolServerSpecsFromArgv", () => {
  it("extracts grouped stdio tool-server blocks (including dash args)", () => {
    const { argv, specs } = extractToolServerSpecsFromArgv([
      "run",
      "ctx.yaml",
      "--tool-server",
      "fetch",
      "--tool-server-type",
      "stdio",
      "--tool-server-command",
      "docker",
      "--tool-server-arg",
      "run",
      "--tool-server-arg",
      "-i",
      "--tool-server-arg",
      "--rm",
      "--tool-server-arg",
      "mcp/fetch",
      "--tool-allow",
      "agent=fetch:fetch",
    ]);
    expect(specs).toEqual(["fetch=stdio:docker,run,-i,--rm,mcp/fetch"]);
    expect(argv).toContain("--tool-allow");
    expect(argv).toContain("agent=fetch:fetch");
  });

  it("extracts grouped sse tool-server blocks", () => {
    const { specs } = extractToolServerSpecsFromArgv([
      "run",
      "ctx.yaml",
      "--tool-server",
      "remote",
      "--tool-server-type",
      "sse",
      "--tool-server-url",
      "https://example.com/sse",
    ]);
    expect(specs).toEqual(["remote=sse:https://example.com/sse"]);
  });
});

