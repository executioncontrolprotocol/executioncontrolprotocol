import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { DOT_PROVIDER_ID } from "../src/lib/secret-provider-ids.js";
import { resolveDotenvPathFromConfig, DEFAULT_DOTENV_BASENAME } from "../src/lib/secrets-config.js";

describe("resolveDotenvPathFromConfig", () => {
  it("defaults to .env in cwd", () => {
    const cwd = "/proj";
    expect(resolveDotenvPathFromConfig(cwd, undefined)).toBe(resolve(cwd, DEFAULT_DOTENV_BASENAME));
  });

  it("uses secrets.providers.dot.env.path when set", () => {
    const cwd = "/proj";
    const p = resolveDotenvPathFromConfig(cwd, {
      secrets: {
        providers: {
          [DOT_PROVIDER_ID]: { path: ".env.local" },
        },
      },
    });
    expect(p).toBe(resolve(cwd, ".env.local"));
  });
});
