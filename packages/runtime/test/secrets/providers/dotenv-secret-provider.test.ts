import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { DOT_PROVIDER_ID } from "../../../src/secrets/provider-ids.js";
import { DotenvSecretProvider } from "../../../src/secrets/providers/dotenv-secret-provider.js";
import type { SecretRef } from "@executioncontrolprotocol/plugins";

describe("DotenvSecretProvider", () => {
  let tempDir: string;
  let dotenvPath: string;
  let provider: DotenvSecretProvider;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "ecp-test-"));
    dotenvPath = join(tempDir, ".env");
    provider = new DotenvSecretProvider(dotenvPath);
  });

  afterEach(() => {
    try {
      if (dotenvPath) {
        unlinkSync(dotenvPath);
      }
      if (tempDir) {
        rmdirSync(tempDir);
      }
    } catch {
      // ignore cleanup errors
    }
  });

  it("has correct id and display name", () => {
    expect(provider.id).toBe(DOT_PROVIDER_ID);
    expect(provider.displayName).toBe("Dotenv file");
  });

  it("is not available when file does not exist", async () => {
    expect(await provider.isAvailable()).toBe(false);
  });

  it("is available when file exists", async () => {
    writeFileSync(dotenvPath, "KEY=value\n");
    expect(await provider.isAvailable()).toBe(true);
  });

  it("has correct capabilities", () => {
    const caps = provider.capabilities();
    expect(caps.secureAtRest).toBe(false);
    expect(caps.headlessSupported).toBe(true);
    expect(caps.persistent).toBe(false);
    expect(caps.supportsList).toBe(false);
    expect(caps.supportsDelete).toBe(false);
  });

  it("returns unhealthy status when file missing", async () => {
    const health = await provider.healthCheck();
    expect(health.ok).toBe(false);
    expect(health.providerId).toBe(DOT_PROVIDER_ID);
    expect(health.message).toContain("not found");
    expect(health.details?.path).toBe(dotenvPath);
  });

  it("returns healthy status when file exists", async () => {
    writeFileSync(dotenvPath, "KEY=value\n");
    const health = await provider.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.providerId).toBe(DOT_PROVIDER_ID);
  });

  it("loads secret from dotenv file", async () => {
    writeFileSync(dotenvPath, "ECP_TEST_TOKEN=abc123\n");
    const ref: SecretRef = {
      id: "ecp://ECP_TEST_TOKEN",
      provider: DOT_PROVIDER_ID,
      key: "ECP_TEST_TOKEN",
    };
    const result = await provider.load(ref);
    expect(result).not.toBeNull();
    expect(result!.value).toBe("abc123");
    expect(result!.redactedPreview).not.toContain("abc123");
  });

  it("returns null for missing key in file", async () => {
    writeFileSync(dotenvPath, "OTHER_KEY=value\n");
    const ref: SecretRef = {
      id: "ecp://MISSING",
      provider: DOT_PROVIDER_ID,
      key: "MISSING",
    };
    const result = await provider.load(ref);
    expect(result).toBeNull();
  });

  it("returns null when file does not exist", async () => {
    const ref: SecretRef = {
      id: "ecp://KEY",
      provider: DOT_PROVIDER_ID,
      key: "KEY",
    };
    const result = await provider.load(ref);
    expect(result).toBeNull();
  });

  it("ignores comments and empty lines", async () => {
    writeFileSync(
      dotenvPath,
      "# comment\n\nECP_TEST_KEY=value\n  # another comment\nOTHER=test\n",
    );
    const ref: SecretRef = {
      id: "ecp://ECP_TEST_KEY",
      provider: DOT_PROVIDER_ID,
      key: "ECP_TEST_KEY",
    };
    const result = await provider.load(ref);
    expect(result).not.toBeNull();
    expect(result!.value).toBe("value");
  });

  it("strips quotes from values", async () => {
    writeFileSync(dotenvPath, 'KEY1="quoted"\nKEY2=\'single-quoted\'\nKEY3=unquoted\n');
    const ref1: SecretRef = {
      id: "ecp://KEY1",
      provider: DOT_PROVIDER_ID,
      key: "KEY1",
    };
    const ref2: SecretRef = {
      id: "ecp://KEY2",
      provider: DOT_PROVIDER_ID,
      key: "KEY2",
    };
    const ref3: SecretRef = {
      id: "ecp://KEY3",
      provider: DOT_PROVIDER_ID,
      key: "KEY3",
    };
    expect((await provider.load(ref1))!.value).toBe("quoted");
    expect((await provider.load(ref2))!.value).toBe("single-quoted");
    expect((await provider.load(ref3))!.value).toBe("unquoted");
  });

  it("handles multiple key-value pairs", async () => {
    writeFileSync(dotenvPath, "KEY1=value1\nKEY2=value2\nKEY3=value3\n");
    const ref: SecretRef = {
      id: "ecp://KEY2",
      provider: DOT_PROVIDER_ID,
      key: "KEY2",
    };
    const result = await provider.load(ref);
    expect(result).not.toBeNull();
    expect(result!.value).toBe("value2");
  });

  it("returns null for empty value", async () => {
    writeFileSync(dotenvPath, "EMPTY_KEY=\n");
    const ref: SecretRef = {
      id: "ecp://EMPTY_KEY",
      provider: DOT_PROVIDER_ID,
      key: "EMPTY_KEY",
    };
    const result = await provider.load(ref);
    expect(result).toBeNull();
  });

  it("redacts secret value in preview", async () => {
    writeFileSync(dotenvPath, "ECP_TEST_LONG=very-long-secret-value-that-should-be-redacted\n");
    const ref: SecretRef = {
      id: "ecp://ECP_TEST_LONG",
      provider: DOT_PROVIDER_ID,
      key: "ECP_TEST_LONG",
    };
    const result = await provider.load(ref);
    expect(result).not.toBeNull();
    expect(result!.redactedPreview).not.toContain("very-long-secret-value");
    expect(result!.redactedPreview.length).toBeLessThan(result!.value.length);
  });
});
