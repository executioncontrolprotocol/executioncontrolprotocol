export type ToolServersConfig = Record<string, { transport: Record<string, unknown> }>;

/**
 * Extract positional `--tool-server` groups from argv.
 *
 * Supported forms:
 * - Existing spec form (kept): `--tool-server name=stdio:command[,args...]`
 * - Positional form (new):
 *   - stdio: `--tool-server <name> stdio <command> [arg1 arg2 ...]`
 *   - sse:   `--tool-server <name> sse <url>`
 *
 * Returns:
 * - argv: argv with the positional `--tool-server ...` groups removed (other flags untouched)
 * - specs: normalized spec strings compatible with {@link parseToolServerSpecs}
 */
export function extractToolServerSpecsFromArgv(argv: string[]): {
  argv: string[];
  specs: string[];
} {
  const outArgv: string[] = [];
  const specs: string[] = [];

  const isFlag = (t: string | undefined): boolean => !!t && t.startsWith("-");

  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t !== "--tool-server") {
      outArgv.push(t);
      continue;
    }

    const a = argv[i + 1];
    if (!a || isFlag(a)) {
      // Keep it so normal parsing can surface a helpful error.
      outArgv.push(t);
      continue;
    }

    // If it looks like the old spec form, keep it in argv so parseArgs can collect it.
    // We'll normalize it later via parseToolServerSpecs.
    const looksLikeSpec = a.includes("=") || a.includes(":");
    if (looksLikeSpec) {
      outArgv.push(t, a);
      i += 1;
      continue;
    }

    // New grouped form:
    //   --tool-server <name>
    //     --tool-server-type <stdio|sse>
    //     --tool-server-command <command>            (stdio)
    //     --tool-server-url <url>                    (sse)
    //     --tool-server-arg <arg>                    (repeatable, stdio)
    //     --tool-server-env KEY=VALUE                (repeatable, stdio)
    //     --tool-server-cwd <path>                   (stdio)
    const name = a;
    let type: "stdio" | "sse" | undefined;
    let command: string | undefined;
    let url: string | undefined;
    const args: string[] = [];
    const env: Record<string, string> = {};
    let cwd: string | undefined;

    let j = i + 2;
    for (; j < argv.length; j++) {
      const tok = argv[j];
      if (tok === "--tool-server") break;

      if (tok === "--tool-server-type") {
        const v = argv[j + 1];
        if (v === "stdio" || v === "sse") {
          type = v;
          j += 1;
          continue;
        }
        // leave it for normal parsing / error
        break;
      }

      if (tok === "--tool-server-command") {
        const v = argv[j + 1];
        if (v && !isFlag(v)) {
          command = v;
          j += 1;
          continue;
        }
        break;
      }

      if (tok === "--tool-server-url") {
        const v = argv[j + 1];
        if (v && !isFlag(v)) {
          url = v;
          j += 1;
          continue;
        }
        break;
      }

      if (tok === "--tool-server-arg") {
        const v = argv[j + 1];
        if (v) {
          args.push(v);
          j += 1;
          continue;
        }
        break;
      }

      if (tok === "--tool-server-env") {
        const v = argv[j + 1];
        const eq = v?.indexOf("=") ?? -1;
        if (v && eq > 0) {
          env[v.slice(0, eq)] = v.slice(eq + 1);
          j += 1;
          continue;
        }
        break;
      }

      if (tok === "--tool-server-cwd") {
        const v = argv[j + 1];
        if (v && !isFlag(v)) {
          cwd = v;
          j += 1;
          continue;
        }
        break;
      }

      // Unknown flag within group; stop and let normal parsing handle it.
      if (isFlag(tok)) break;
    }

    if (type === "stdio" && command) {
      const envPart =
        Object.keys(env).length > 0
          ? `;env=${Object.entries(env).map(([k, v]) => `${k}=${v}`).join(",")}`
          : "";
      const cwdPart = cwd ? `;cwd=${cwd}` : "";
      specs.push(`${name}=stdio:${[command, ...args].join(",")}${cwdPart}${envPart}`);
      i = j - 1;
      continue;
    }

    if (type === "sse" && url) {
      specs.push(`${name}=sse:${url}`);
      i = j - 1;
      continue;
    }

    // Could not fully parse; keep `--tool-server <name>` so the CLI can surface an error.
    outArgv.push(t, name);
    i += 1;
  }

  return { argv: outArgv, specs };
}

/**
 * Parse user-friendly tool server specs into engine toolServers config.
 *
 * Spec format (repeatable):
 * - stdio: `<name>=stdio:<command>[,<arg1>,<arg2>...]`
 * - sse:   `<name>=sse:<url>`
 *
 * Examples:
 * - `fetch=stdio:docker,run,-i,--rm,mcp/fetch`
 * - `test-jira=stdio:npx,tsx,packages/runtime/test/integration/servers/fake-mcp-server.ts`
 * - `remote=sse:https://example.com/sse`
 */
export function parseToolServerSpecs(specs: string[]): ToolServersConfig {
  const out: ToolServersConfig = {};

  for (const raw of specs) {
    const spec = raw.trim();
    if (!spec) continue;

    const eqIdx = spec.indexOf("=");
    if (eqIdx === -1) {
      throw new Error(
        `Invalid --tool-server value "${raw}" (expected name=stdio:command[,args...] or name=sse:url)`,
      );
    }

    const name = spec.slice(0, eqIdx).trim();
    const rhs = spec.slice(eqIdx + 1).trim();
    if (!name || !rhs) {
      throw new Error(
        `Invalid --tool-server value "${raw}" (expected name=stdio:command[,args...] or name=sse:url)`,
      );
    }

    if (rhs.startsWith("stdio:")) {
      const rest = rhs.slice("stdio:".length);
      const [cmdAndArgsPart, ...kvParts] = rest.split(";").map((s) => s.trim()).filter(Boolean);
      const parts = (cmdAndArgsPart ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const command = parts[0];
      const args = parts.slice(1);
      if (!command) {
        throw new Error(
          `Invalid --tool-server stdio spec "${raw}" (missing command)`,
        );
      }
      const transport: Record<string, unknown> = {
        type: "stdio",
        command,
        args,
      };
      for (const kv of kvParts) {
        const eq = kv.indexOf("=");
        if (eq === -1) continue;
        const key = kv.slice(0, eq);
        const value = kv.slice(eq + 1);
        if (key === "cwd" && value) {
          transport.cwd = value;
        }
        if (key === "env" && value) {
          const env: Record<string, string> = {};
          for (const pair of value.split(",").map((s) => s.trim()).filter(Boolean)) {
            const e = pair.indexOf("=");
            if (e > 0) env[pair.slice(0, e)] = pair.slice(e + 1);
          }
          transport.env = env;
        }
      }
      out[name] = {
        transport,
      };
      continue;
    }

    if (rhs.startsWith("sse:")) {
      const url = rhs.slice("sse:".length).trim();
      if (!url) {
        throw new Error(
          `Invalid --tool-server sse spec "${raw}" (missing url)`,
        );
      }
      out[name] = {
        transport: {
          type: "sse",
          url,
        },
      };
      continue;
    }

    throw new Error(
      `Invalid --tool-server value "${raw}" (unknown transport; use stdio: or sse:)`,
    );
  }

  return out;
}

