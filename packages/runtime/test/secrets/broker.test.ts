import { afterEach, describe, expect, it, vi } from "vitest";

import { DefaultSecretBroker } from "../../src/secrets/broker.js";
import { DefaultSecretProviderRegistry } from "../../src/secrets/registry.js";
import { registerBuiltinSecretProviders } from "../../src/secrets/builtin.js";
import type { SecretRef, ToolServerCredentialBinding } from "@executioncontrolprotocol/plugins";

describe("DefaultSecretBroker", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves env provider secrets", async () => {
    vi.stubEnv("ECP_BROKER_TEST_SECRET", "top-secret-value");
    const registry = new DefaultSecretProviderRegistry();
    registerBuiltinSecretProviders(registry);
    const broker = new DefaultSecretBroker(registry, "permissive");
    const ref: SecretRef = {
      id: "ecp://env/ECP_BROKER_TEST_SECRET",
      provider: "env",
      key: "ECP_BROKER_TEST_SECRET",
    };
    const r = await broker.resolve(ref);
    expect(r.value).toBe("top-secret-value");
    expect(r.redactedPreview).not.toContain("top-secret");
  });

  it("resolveBindingsToEnv maps binding names", async () => {
    vi.stubEnv("ECP_BROKER_TEST_TOKEN", "abc123");
    const registry = new DefaultSecretProviderRegistry();
    registerBuiltinSecretProviders(registry);
    const broker = new DefaultSecretBroker(registry, "permissive");
    const bindings: ToolServerCredentialBinding[] = [
      {
        name: "TOKEN",
        source: { provider: "env", key: "ECP_BROKER_TEST_TOKEN" },
        required: true,
        delivery: "env",
      },
    ];
    const { env, warnings } = await broker.resolveBindingsToEnv(bindings);
    expect(env.TOKEN).toBe("abc123");
    expect(warnings.length).toBe(0);
  });

  it("strict policy rejects insecure provider without allowInsecure", async () => {
    const registry = new DefaultSecretProviderRegistry();
    registerBuiltinSecretProviders(registry);
    const broker = new DefaultSecretBroker(registry, "strict");
    const binding: ToolServerCredentialBinding = {
      name: "X",
      source: { provider: "env", key: "ECP_BROKER_TEST_UNUSED" },
      required: false,
    };
    await expect(broker.resolveBinding(binding)).rejects.toThrow(/strict/);
  });
});
