import { afterEach, describe, expect, it } from "vitest";
import {
  clearCliSessionSecrets,
  createDefaultSecretBroker,
  secretRefIdFromLogicalKey,
} from "@executioncontrolprotocol/runtime";
import type { SecretRef } from "@executioncontrolprotocol/plugins";

describe("CLI secrets commands (via broker)", () => {
  afterEach(() => {
    clearCliSessionSecrets();
  });

  it("stores and retrieves secrets via session provider", async () => {
    const { registry } = createDefaultSecretBroker({ policy: "permissive" });
    const provider = registry.get("session");
    expect(provider).not.toBeNull();

    const input = {
      ref: {
        id: secretRefIdFromLogicalKey("test-key"),
        provider: "session",
        key: "test-key",
      } as SecretRef,
      value: "test-secret-value",
    };

    await provider!.store!(input);
    const result = await provider!.load(input.ref);
    expect(result).not.toBeNull();
    expect(result!.value).toBe("test-secret-value");
    expect(result!.redactedPreview).not.toContain("test-secret-value");
  });

  it("lists stored secrets", async () => {
    const { registry } = createDefaultSecretBroker({ policy: "permissive" });
    const provider = registry.get("session");
    expect(provider).not.toBeNull();

    await provider!.store!({
      ref: {
        id: secretRefIdFromLogicalKey("key1"),
        provider: "session",
        key: "key1",
      } as SecretRef,
      value: "value1",
    });
    await provider!.store!({
      ref: {
        id: secretRefIdFromLogicalKey("key2"),
        provider: "session",
        key: "key2",
      } as SecretRef,
      value: "value2",
    });

    const list = await provider!.list!();
    expect(list.length).toBeGreaterThanOrEqual(2);
    const keys = list.map((r) => r.key);
    expect(keys).toContain("key1");
    expect(keys).toContain("key2");
  });

  it("deletes stored secrets", async () => {
    const { registry } = createDefaultSecretBroker({ policy: "permissive" });
    const provider = registry.get("session");
    expect(provider).not.toBeNull();

    const ref: SecretRef = {
      id: secretRefIdFromLogicalKey("delete-test"),
      provider: "session",
      key: "delete-test",
    };

    await provider!.store!({ ref, value: "to-delete" });
    expect(await provider!.load(ref)).not.toBeNull();

    await provider!.delete!(ref);
    expect(await provider!.load(ref)).toBeNull();
  });

  it("returns null for missing secrets", async () => {
    const { registry } = createDefaultSecretBroker({ policy: "permissive" });
    const provider = registry.get("session");
    expect(provider).not.toBeNull();

    const ref: SecretRef = {
      id: secretRefIdFromLogicalKey("missing"),
      provider: "session",
      key: "missing",
    };

    const result = await provider!.load(ref);
    expect(result).toBeNull();
  });

  it("validates provider capabilities", async () => {
    const { registry } = createDefaultSecretBroker({ policy: "permissive" });
    const provider = registry.get("session");
    expect(provider).not.toBeNull();

    const caps = provider!.capabilities();
    expect(caps.secureAtRest).toBe(false);
    expect(caps.headlessSupported).toBe(true);
    expect(caps.persistent).toBe(false);
    expect(caps.supportsList).toBe(true);
    expect(caps.supportsDelete).toBe(true);
  });
});
