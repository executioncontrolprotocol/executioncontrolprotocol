import { describe, expect, it } from "vitest";

import { ECP_SECRET_REF_PROTOCOL_PREFIX } from "../../src/secrets/constants.js";
import {
  normalizeOsKeychainAccountKey,
  osKeychainCredentialTarget,
} from "../../src/secrets/os-keychain-account-key.js";
import { secretRefIdFromLogicalKey } from "../../src/secrets/ref.js";

describe("normalizeOsKeychainAccountKey", () => {
  it("prefixes bare keys with ecp.", () => {
    expect(normalizeOsKeychainAccountKey("server.fetch.token")).toBe("ecp.server.fetch.token");
  });

  it("maps slashes to dots and adds ecp.", () => {
    expect(normalizeOsKeychainAccountKey("server/fetch/token")).toBe("ecp.server.fetch.token");
  });

  it("strips leading ecp/ path segment before normalizing", () => {
    expect(normalizeOsKeychainAccountKey("ecp/server/fetch.token")).toBe("ecp.server.fetch.token");
  });

  it("leaves already-dotted ecp.* keys unchanged", () => {
    expect(normalizeOsKeychainAccountKey("ecp.server.fetch.token")).toBe("ecp.server.fetch.token");
  });

  it("normalizes backslashes", () => {
    expect(normalizeOsKeychainAccountKey("a\\b\\c")).toBe("ecp.a.b.c");
  });

  it("trims whitespace", () => {
    expect(normalizeOsKeychainAccountKey("  my.key  ")).toBe("ecp.my.key");
  });
});

describe("osKeychainCredentialTarget", () => {
  it("matches secret ref id shape (no provider in URI)", () => {
    expect(osKeychainCredentialTarget("GITHUB_PAT")).toBe(secretRefIdFromLogicalKey("GITHUB_PAT"));
  });

  it("normalizes backslashes to slashes in the path", () => {
    expect(osKeychainCredentialTarget("a\\b")).toBe(`${ECP_SECRET_REF_PROTOCOL_PREFIX}a/b`);
  });
});
