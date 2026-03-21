import { describe, expect, it } from "vitest";

import { OS_PROVIDER_ID } from "../../src/secrets/provider-ids.js";
import { secretRefFromBinding, secretRefIdFromLogicalKey } from "../../src/secrets/ref.js";

describe("secretRefIdFromLogicalKey", () => {
  it("uses ecp:// prefix with key only", () => {
    expect(secretRefIdFromLogicalKey("GITHUB_API_KEY")).toBe("ecp://GITHUB_API_KEY");
  });
});

describe("secretRefFromBinding", () => {
  it("defaults id to ecp://key without provider in the URI", () => {
    const ref = secretRefFromBinding({
      name: "TOKEN",
      source: { provider: OS_PROVIDER_ID, key: "GITHUB_API_KEY" },
      required: true,
      delivery: "env",
    });
    expect(ref.id).toBe("ecp://GITHUB_API_KEY");
    expect(ref.provider).toBe(OS_PROVIDER_ID);
    expect(ref.key).toBe("GITHUB_API_KEY");
  });

  it("respects explicit refId override", () => {
    const ref = secretRefFromBinding({
      name: "TOKEN",
      source: {
        provider: OS_PROVIDER_ID,
        key: "K",
        refId: "custom:opaque",
      },
      required: true,
      delivery: "env",
    });
    expect(ref.id).toBe("custom:opaque");
  });
});
