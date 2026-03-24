import { describe, expect, it } from "vitest";

import type { EcpPluginManifest } from "@executioncontrolprotocol/spec";
import type { ECPSystemConfig } from "@executioncontrolprotocol/runtime";

import { applyManifestWiringToSystemConfig } from "../src/lib/plugin-install.js";

describe("applyManifestWiringToSystemConfig", () => {
  it("merges tool wiring and seeds security.tools allow list", () => {
    const manifest: EcpPluginManifest = {
      schemaVersion: "1",
      kind: "tool",
      id: "demo-tool",
      wiring: {
        tool: {
          serverName: "demo",
          server: {
            transport: { type: "stdio", command: "node", args: ["index.js"] },
            config: {},
          },
        },
      },
    };
    const cfg: ECPSystemConfig = {
      version: "0.5",
      security: {
        models: {},
        tools: {},
        executors: {},
        memory: {},
        agents: {},
        loggers: {},
        secrets: {},
        plugins: {},
      },
    };
    applyManifestWiringToSystemConfig(cfg, manifest, {});
    expect(cfg.tools?.servers?.demo?.transport?.type).toBe("stdio");
    expect(cfg.security?.tools?.allowServers).toContain("demo");
  });
});
