import { describe, expect, it, vi, beforeEach } from "vitest";

import { OS_PROVIDER_ID } from "../../../src/secrets/provider-ids.js";
import { OsKeychainSecretProvider } from "../../../src/secrets/providers/os-keychain-secret-provider.js";
import { ECP_KEYRING_SERVICE } from "../../../src/secrets/constants.js";
import { osKeychainCredentialTarget } from "../../../src/secrets/os-keychain-account-key.js";
import type { SecretRef, SecretStoreInput } from "@executioncontrolprotocol/plugins";

const SEP = "\x1f";

type TargetStored = { password: string; username: string };

const { mockKeyringStore } = vi.hoisted(() => ({
  mockKeyringStore: new Map<string, string | TargetStored>(),
}));

vi.mock("@napi-rs/keyring", () => {
  return {
    Entry: class MockEntry {
      private _target?: string;

      static withTarget(target: string, service: string, username: string): MockEntry {
        const e = new MockEntry(service, username);
        e._target = target;
        return e;
      }

      constructor(
        private service: string,
        private account: string,
      ) {}

      private storageKey(): string {
        return this._target ? `${this.service}${SEP}${this._target}` : `${this.service}:${this.account}`;
      }

      setPassword(password: string): void {
        if (this._target) {
          mockKeyringStore.set(this.storageKey(), {
            password,
            username: this.account,
          });
        } else {
          mockKeyringStore.set(this.storageKey(), password);
        }
      }

      getPassword(): string | null {
        const v = mockKeyringStore.get(this.storageKey());
        if (v == null) return null;
        if (typeof v === "string") return v;
        return v.password;
      }

      deletePassword(): void {
        mockKeyringStore.delete(this.storageKey());
      }
    },
    findCredentials: (service: string, target?: string | null) => {
      const creds: Array<{ account: string }> = [];
      for (const key of mockKeyringStore.keys()) {
        if (key.includes(SEP)) {
          const sepIdx = key.indexOf(SEP);
          const svc = key.slice(0, sepIdx);
          const storeTarget = key.slice(sepIdx + SEP.length);
          if (svc !== service) continue;
          if (target === "ecp://*" && !storeTarget.startsWith("ecp://")) continue;
          const val = mockKeyringStore.get(key);
          if (val && typeof val === "object") {
            creds.push({ account: val.username });
          }
        } else {
          const [svc, account] = key.split(":");
          if (svc === service) {
            creds.push({ account });
          }
        }
      }
      return creds;
    },
  };
});

describe("OsKeychainSecretProvider", () => {
  let provider: OsKeychainSecretProvider;

  beforeEach(() => {
    mockKeyringStore.clear();
    provider = new OsKeychainSecretProvider();
  });

  it("has correct id and display name", () => {
    expect(provider.id).toBe(OS_PROVIDER_ID);
    expect(provider.displayName).toBe("OS keychain / credential manager");
  });

  it("is available when keyring module works", async () => {
    expect(await provider.isAvailable()).toBe(true);
  });

  it("has correct capabilities", () => {
    const caps = provider.capabilities();
    expect(caps.secureAtRest).toBe(true);
    expect(caps.interactiveUnlock).toBe(true);
    expect(caps.headlessSupported).toBe(true);
    expect(caps.persistent).toBe(true);
    expect(caps.supportsList).toBe(true);
    expect(caps.supportsDelete).toBe(true);
  });

  it("returns healthy status when available", async () => {
    const health = await provider.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.providerId).toBe(OS_PROVIDER_ID);
  });

  it("stores and loads secrets using ecp://<key> keyring targets", async () => {
    const input: SecretStoreInput = {
      ref: {
        id: `ecp://test-key`,
        provider: OS_PROVIDER_ID,
        key: "test-key",
      },
      value: "secret-value",
    };
    await provider.store(input);

    const ref: SecretRef = {
      id: `ecp://test-key`,
      provider: OS_PROVIDER_ID,
      key: "test-key",
    };
    const result = await provider.load(ref);
    expect(result).not.toBeNull();
    expect(result!.value).toBe("secret-value");
    expect(result!.redactedPreview).not.toContain("secret-value");
    const target = osKeychainCredentialTarget("test-key");
    expect(mockKeyringStore.has(`${ECP_KEYRING_SERVICE}${SEP}${target}`)).toBe(true);
  });

  it("returns null for missing secret", async () => {
    const ref: SecretRef = {
      id: `ecp://missing`,
      provider: OS_PROVIDER_ID,
      key: "missing",
    };
    const result = await provider.load(ref);
    expect(result).toBeNull();
  });

  it("deletes secrets", async () => {
    const input: SecretStoreInput = {
      ref: {
        id: `ecp://delete-test`,
        provider: OS_PROVIDER_ID,
        key: "delete-test",
      },
      value: "to-delete",
    };
    await provider.store(input);
    expect(await provider.load(input.ref)).not.toBeNull();

    await provider.delete(input.ref);
    expect(await provider.load(input.ref)).toBeNull();
  });

  it("lists stored secrets with logical keys", async () => {
    const input1: SecretStoreInput = {
      ref: {
        id: `ecp://list-key1`,
        provider: OS_PROVIDER_ID,
        key: "list-key1",
      },
      value: "value1",
    };
    const input2: SecretStoreInput = {
      ref: {
        id: `ecp://list-key2`,
        provider: OS_PROVIDER_ID,
        key: "list-key2",
      },
      value: "value2",
    };
    await provider.store(input1);
    await provider.store(input2);

    const list = await provider.list();
    expect(list.length).toBe(2);
    const keys = list.map((r) => r.key);
    expect(keys).toContain("list-key1");
    expect(keys).toContain("list-key2");
    expect(list.every((r) => r.provider === OS_PROVIDER_ID)).toBe(true);
    expect(list.every((r) => r.id.startsWith(`ecp://`))).toBe(true);
  });

  it("maps list entries that are already ecp:// targets to secret refs", () => {
    const anyProvider = provider as unknown as {
      listAccountToSecretRef(account: string): SecretRef;
    };
    const id = "ecp://my/token";
    const r = anyProvider.listAccountToSecretRef(id);
    expect(r.id).toBe(id);
    expect(r.key).toBe("my/token");
  });

  it("maps legacy ecp://os.secrets/key list accounts to canonical refs", () => {
    const anyProvider = provider as unknown as {
      listAccountToSecretRef(account: string): SecretRef;
    };
    const legacy = `ecp://${OS_PROVIDER_ID}/legacy-key`;
    const r = anyProvider.listAccountToSecretRef(legacy);
    expect(r.key).toBe("legacy-key");
    expect(r.id).toBe("ecp://legacy-key");
  });

  it("uses ECP_KEYRING_SERVICE for storage", async () => {
    const input: SecretStoreInput = {
      ref: {
        id: "ecp://service-test",
        provider: OS_PROVIDER_ID,
        key: "service-test",
      },
      value: "test",
    };
    await provider.store(input);

    const { findCredentials } = await import("@napi-rs/keyring");
    const creds = findCredentials(ECP_KEYRING_SERVICE);
    expect(creds.some((c) => c.account === "service-test")).toBe(true);
  });

  it("redacts secret value in preview", async () => {
    const input: SecretStoreInput = {
      ref: {
        id: `ecp://redact-test`,
        provider: OS_PROVIDER_ID,
        key: "redact-test",
      },
      value: "very-long-secret-value-that-should-be-redacted",
    };
    await provider.store(input);

    const result = await provider.load(input.ref);
    expect(result).not.toBeNull();
    expect(result!.redactedPreview).not.toContain("very-long-secret-value");
    expect(result!.redactedPreview.length).toBeLessThan(result!.value.length);
  });
});
