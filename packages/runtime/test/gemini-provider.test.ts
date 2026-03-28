import { describe, expect, it, vi, beforeEach } from "vitest";

import { GeminiProvider } from "../src/providers/gemini/gemini-provider.js";
import { ProviderInitializationError } from "../src/providers/provider-init-error.js";

describe("GeminiProvider", () => {
  const originalEnv = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = originalEnv;
  });

  describe("constructor", () => {
    it("throws ProviderInitializationError when no API key", () => {
      delete process.env.GEMINI_API_KEY;
      expect(() => new GeminiProvider()).toThrow(ProviderInitializationError);
      expect(() => new GeminiProvider()).toThrow(/GEMINI_API_KEY/);
    });

    it("provides a hint about GEMINI_API_KEY", () => {
      delete process.env.GEMINI_API_KEY;
      try {
        new GeminiProvider();
      } catch (err) {
        expect(err).toBeInstanceOf(ProviderInitializationError);
        expect((err as ProviderInitializationError).hint).toMatch(/GEMINI_API_KEY/);
      }
    });

    it("accepts explicit apiKey config", () => {
      delete process.env.GEMINI_API_KEY;
      const provider = new GeminiProvider({ apiKey: "test-key" });
      expect(provider.name).toBe("gemini");
    });

    it("reads GEMINI_API_KEY from env", () => {
      process.env.GEMINI_API_KEY = "env-key";
      const provider = new GeminiProvider();
      expect(provider.name).toBe("gemini");
    });
  });

  describe("supportsToolCalling", () => {
    it("returns true", () => {
      process.env.GEMINI_API_KEY = "test";
      const provider = new GeminiProvider();
      expect(provider.supportsToolCalling()).toBe(true);
    });
  });

  describe("generate", () => {
    it("calls Gemini generateContent with correct params", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      const provider = new GeminiProvider();

      const mockResponse = {
        candidates: [
          {
            content: { parts: [{ text: "Hello!" }], role: "model" },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          totalTokenCount: 15,
        },
        text: "Hello!",
        functionCalls: undefined,
      };

      const generateSpy = vi
        .spyOn(
          (provider as unknown as { client: { models: { generateContent: unknown } } }).client.models,
          "generateContent",
        )
        .mockResolvedValue(mockResponse as never);

      const result = await provider.generate({
        messages: [
          { role: "system", content: "You are helpful." },
          { role: "user", content: "Hi" },
        ],
      });

      expect(generateSpy).toHaveBeenCalledOnce();
      const callArgs = generateSpy.mock.calls[0]!;
      const params = callArgs[0] as { model: string; contents: unknown[]; config: Record<string, unknown> };
      expect(params.model).toBe("gemini-2.5-flash");
      expect(params.config.systemInstruction).toBe("You are helpful.");
      expect(params.contents).toEqual([
        { role: "user", parts: [{ text: "Hi" }] },
      ]);

      expect(result.content).toBe("Hello!");
      expect(result.finishReason).toBe("stop");
      expect(result.toolCalls).toEqual([]);
      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });
    });

    it("handles function call response", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      const provider = new GeminiProvider();

      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                { functionCall: { id: "fc_01", name: "search", args: { query: "test" } } },
              ],
              role: "model",
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 20,
          candidatesTokenCount: 10,
          totalTokenCount: 30,
        },
        text: "",
        functionCalls: [{ id: "fc_01", name: "search", args: { query: "test" } }],
      };

      vi.spyOn(
        (provider as unknown as { client: { models: { generateContent: unknown } } }).client.models,
        "generateContent",
      ).mockResolvedValue(mockResponse as never);

      const result = await provider.generate({
        messages: [{ role: "user", content: "Search for test" }],
        tools: [
          {
            name: "search",
            description: "Search the web",
            parameters: { type: "object", properties: { query: { type: "string" } } },
          },
        ],
      });

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]).toEqual({
        id: "fc_01",
        name: "search",
        arguments: { query: "test" },
      });
    });

    it("maps MAX_TOKENS finish reason to length", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      const provider = new GeminiProvider();

      const mockResponse = {
        candidates: [
          {
            content: { parts: [{ text: "Truncated..." }], role: "model" },
            finishReason: "MAX_TOKENS",
          },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4096, totalTokenCount: 4106 },
        text: "Truncated...",
        functionCalls: undefined,
      };

      vi.spyOn(
        (provider as unknown as { client: { models: { generateContent: unknown } } }).client.models,
        "generateContent",
      ).mockResolvedValue(mockResponse as never);

      const result = await provider.generate({
        messages: [{ role: "user", content: "Write a long essay" }],
      });

      expect(result.finishReason).toBe("length");
    });

    it("maps SAFETY finish reason to content-filter", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      const provider = new GeminiProvider();

      const mockResponse = {
        candidates: [
          {
            content: { parts: [{ text: "" }], role: "model" },
            finishReason: "SAFETY",
          },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 0, totalTokenCount: 10 },
        text: "",
        functionCalls: undefined,
      };

      vi.spyOn(
        (provider as unknown as { client: { models: { generateContent: unknown } } }).client.models,
        "generateContent",
      ).mockResolvedValue(mockResponse as never);

      const result = await provider.generate({
        messages: [{ role: "user", content: "Bad content" }],
      });

      expect(result.finishReason).toBe("content-filter");
    });

    it("uses override model when provided", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      const provider = new GeminiProvider();

      const mockResponse = {
        candidates: [{ content: { parts: [{ text: "OK" }], role: "model" }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1, totalTokenCount: 6 },
        text: "OK",
        functionCalls: undefined,
      };

      const generateSpy = vi
        .spyOn(
          (provider as unknown as { client: { models: { generateContent: unknown } } }).client.models,
          "generateContent",
        )
        .mockResolvedValue(mockResponse as never);

      await provider.generate({
        messages: [{ role: "user", content: "Hi" }],
        model: "gemini-2.5-pro",
      });

      const params = generateSpy.mock.calls[0]![0] as { model: string };
      expect(params.model).toBe("gemini-2.5-pro");
    });
  });
});
