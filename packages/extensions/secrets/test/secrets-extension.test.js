import { describe, expect, it } from "vitest";
import { clearMemorySecrets, memorySecretsStore, secretsExtension, setMemorySecret, setSecretsStore, resetSecretsStore, } from "../src/index.js";
import { catalogExtension, getCatalogedExtension } from "@executioncontrolprotocol/core";
describe("@executioncontrolprotocol/secrets extension", () => {
    it("catalogs on load", () => {
        catalogExtension(secretsExtension);
        expect(getCatalogedExtension("@executioncontrolprotocol/secrets")).toBeDefined();
    });
    it("memory store round-trips", async () => {
        clearMemorySecrets();
        await memorySecretsStore.set("k", "v");
        expect(await memorySecretsStore.get("k")).toBe("v");
        expect(await memorySecretsStore.list()).toContain("k");
        await memorySecretsStore.delete("k");
        expect(await memorySecretsStore.get("k")).toBeUndefined();
    });
    it("setMemorySecret helper", async () => {
        setSecretsStore(memorySecretsStore);
        clearMemorySecrets();
        setMemorySecret("API_KEY", "test-value");
        expect(await memorySecretsStore.get("API_KEY")).toBe("test-value");
        resetSecretsStore();
    });
});
//# sourceMappingURL=secrets-extension.test.js.map