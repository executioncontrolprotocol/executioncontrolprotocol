import { afterEach, describe, expect, it, vi } from "vitest";

import { ENV_PROVIDER_ID } from "../../../src/secrets/provider-ids.js";
import { EnvSecretProvider } from "../../../src/secrets/providers/env-secret-provider.js";
import type { SecretRef } from "@executioncontrolprotocol/plugins";

describe("EnvSecretProvider", () => {
  const provider = new EnvSecretProvider();

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("has correct id and display name", () => {
    expect(provider.id).toBe(ENV_PROVIDER_ID);
    expect(provider.displayName).toBe("Process environment");
  });

  it("is always available", async () => {
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

  it("returns healthy status", async () => {
    const health = await provider.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.providerId).toBe(ENV_PROVIDER_ID);
  });

  it("loads secret from process.env", async () => {
    vi.stubEnv("ECP_TEST_SECRET", "secret-value");
    const ref: SecretRef = {
      id: "ecp://ECP_TEST_SECRET",
      provider: ENV_PROVIDER_ID,
      key: "ECP_TEST_SECRET",
    };
    const result = await provider.load(ref);
    expect(result).not.toBeNull();
    expect(result!.value).toBe("secret-value");
    expect(result!.redactedPreview).not.toContain("secret-value");
  });

  it("returns null for missing env var", async () => {
    const ref: SecretRef = {
      id: "ecp://MISSING",
      provider: ENV_PROVIDER_ID,
      key: "MISSING",
    };
    const result = await provider.load(ref);
    expect(result).toBeNull();
  });

  it("returns null for empty env var", async () => {
    vi.stubEnv("ECP_TEST_EMPTY", "");
    const ref: SecretRef = {
      id: "ecp://ECP_TEST_EMPTY",
      provider: ENV_PROVIDER_ID,
      key: "ECP_TEST_EMPTY",
    };
    const result = await provider.load(ref);
    expect(result).toBeNull();
  });

  it("redacts secret value in preview", async () => {
    vi.stubEnv("ECP_TEST_LONG", "very-long-secret-value-that-should-be-redacted");
    const ref: SecretRef = {
      id: "ecp://ECP_TEST_LONG",
      provider: ENV_PROVIDER_ID,
      key: "ECP_TEST_LONG",
    };
    const result = await provider.load(ref);
    expect(result).not.toBeNull();
    expect(result!.redactedPreview).not.toContain("very-long-secret-value");
    expect(result!.redactedPreview.length).toBeLessThan(result!.value.length);
  });
});
