import { describe, expect, it } from "vitest";

import { ECP_SECRET_REF_PROTOCOL_PREFIX } from "../../src/secrets/constants.js";
import { OS_PROVIDER_ID } from "../../src/secrets/provider-ids.js";
import { secretRefFromBinding, secretRefIdFromLogicalKey } from "../../src/secrets/ref.js";

describe("secretRefIdFromLogicalKey", () => {
  it("uses protocol prefix with key only", () => {
    expect(secretRefIdFromLogicalKey("GITHUB_API_KEY")).toBe(
      `${ECP_SECRET_REF_PROTOCOL_PREFIX}GITHUB_API_KEY`,
    );
  });
});

describe("secretRefFromBinding", () => {
  it("defaults id to protocol key URI without provider in the path", () => {
    const ref = secretRefFromBinding({
      name: "TOKEN",
      source: { provider: OS_PROVIDER_ID, key: "GITHUB_API_KEY" },
      required: true,
      delivery: "env",
    });
    expect(ref.id).toBe(`${ECP_SECRET_REF_PROTOCOL_PREFIX}GITHUB_API_KEY`);
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
