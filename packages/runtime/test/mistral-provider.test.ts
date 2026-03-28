import { describe, expect, it, vi, beforeEach } from "vitest";

import { MistralProvider } from "../src/providers/mistral/mistral-provider.js";
import { ProviderInitializationError } from "../src/providers/provider-init-error.js";

describe("MistralProvider", () => {
  const originalEnv = process.env.MISTRAL_API_KEY;

  beforeEach(() => {
    process.env.MISTRAL_API_KEY = originalEnv;
  });

  describe("constructor", () => {
    it("throws ProviderInitializationError when no API key", () => {
      delete process.env.MISTRAL_API_KEY;
      expect(() => new MistralProvider()).toThrow(ProviderInitializationError);
      expect(() => new MistralProvider()).toThrow(/MISTRAL_API_KEY/);
    });

    it("provides a hint about MISTRAL_API_KEY", () => {
      delete process.env.MISTRAL_API_KEY;
      try {
        new MistralProvider();
      } catch (err) {
        expect(err).toBeInstanceOf(ProviderInitializationError);
        expect((err as ProviderInitializationError).hint).toMatch(/MISTRAL_API_KEY/);
      }
    });

    it("accepts explicit apiKey config", () => {
      delete process.env.MISTRAL_API_KEY;
      const provider = new MistralProvider({ apiKey: "test-key" });
      expect(provider.name).toBe("mistral");
    });

    it("reads MISTRAL_API_KEY from env", () => {
      process.env.MISTRAL_API_KEY = "env-key";
      const provider = new MistralProvider();
      expect(provider.name).toBe("mistral");
    });
  });

  describe("supportsToolCalling", () => {
    it("returns true", () => {
      process.env.MISTRAL_API_KEY = "test";
      const provider = new MistralProvider();
      expect(provider.supportsToolCalling()).toBe(true);
    });
  });

  describe("generate", () => {
    it("calls Mistral chat.complete with correct params", async () => {
      process.env.MISTRAL_API_KEY = "test-key";
      const provider = new MistralProvider();

      const mockResponse = {
        id: "chat-123",
        object: "chat.completion",
        model: "mistral-small-latest",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Hello!" },
            finishReason: "stop",
          },
        ],
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      };

      const completeSpy = vi
        .spyOn(
          (provider as unknown as { client: { chat: { complete: unknown } } }).client.chat,
          "complete",
        )
        .mockResolvedValue(mockResponse as never);

      const result = await provider.generate({
        messages: [
          { role: "system", content: "You are helpful." },
          { role: "user", content: "Hi" },
        ],
      });

      expect(completeSpy).toHaveBeenCalledOnce();
      const callArgs = completeSpy.mock.calls[0]!;
      const params = callArgs[0] as { model: string; messages: Array<{ role: string; content: string }> };
      expect(params.model).toBe("mistral-small-latest");
      expect(params.messages).toEqual([
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Hi" },
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

    it("handles tool_calls response", async () => {
      process.env.MISTRAL_API_KEY = "test-key";
      const provider = new MistralProvider();

      const mockResponse = {
        id: "chat-456",
        object: "chat.completion",
        model: "mistral-small-latest",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "",
              toolCalls: [
                {
                  id: "tc_01",
                  type: "function",
                  function: { name: "search", arguments: { query: "test" } },
                },
              ],
            },
            finishReason: "tool_calls",
          },
        ],
        usage: { promptTokens: 20, completionTokens: 15, totalTokens: 35 },
      };

      vi.spyOn(
        (provider as unknown as { client: { chat: { complete: unknown } } }).client.chat,
        "complete",
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

      expect(result.finishReason).toBe("tool-calls");
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]).toEqual({
        id: "tc_01",
        name: "search",
        arguments: { query: "test" },
      });
    });

    it("handles tool call arguments as JSON string", async () => {
      process.env.MISTRAL_API_KEY = "test-key";
      const provider = new MistralProvider();

      const mockResponse = {
        id: "chat-789",
        object: "chat.completion",
        model: "mistral-small-latest",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "",
              toolCalls: [
                {
                  id: "tc_02",
                  type: "function",
                  function: { name: "lookup", arguments: '{"key": "value"}' },
                },
              ],
            },
            finishReason: "tool_calls",
          },
        ],
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      };

      vi.spyOn(
        (provider as unknown as { client: { chat: { complete: unknown } } }).client.chat,
        "complete",
      ).mockResolvedValue(mockResponse as never);

      const result = await provider.generate({
        messages: [{ role: "user", content: "Look up key" }],
      });

      expect(result.toolCalls[0]!.arguments).toEqual({ key: "value" });
    });

    it("maps length finish reason", async () => {
      process.env.MISTRAL_API_KEY = "test-key";
      const provider = new MistralProvider();

      const mockResponse = {
        id: "chat-len",
        object: "chat.completion",
        model: "mistral-small-latest",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Truncated..." },
            finishReason: "length",
          },
        ],
        usage: { promptTokens: 10, completionTokens: 4096, totalTokens: 4106 },
      };

      vi.spyOn(
        (provider as unknown as { client: { chat: { complete: unknown } } }).client.chat,
        "complete",
      ).mockResolvedValue(mockResponse as never);

      const result = await provider.generate({
        messages: [{ role: "user", content: "Write a long essay" }],
      });

      expect(result.finishReason).toBe("length");
    });

    it("maps tool result messages", async () => {
      process.env.MISTRAL_API_KEY = "test-key";
      const provider = new MistralProvider();

      const mockResponse = {
        id: "chat-tool",
        object: "chat.completion",
        model: "mistral-small-latest",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "The answer is 42." },
            finishReason: "stop",
          },
        ],
        usage: { promptTokens: 30, completionTokens: 10, totalTokens: 40 },
      };

      const completeSpy = vi
        .spyOn(
          (provider as unknown as { client: { chat: { complete: unknown } } }).client.chat,
          "complete",
        )
        .mockResolvedValue(mockResponse as never);

      await provider.generate({
        messages: [
          { role: "user", content: "What is the answer?" },
          { role: "assistant", content: "Let me look." },
          { role: "tool", content: "42", toolCallId: "tc_01", name: "lookup" },
        ],
      });

      const params = completeSpy.mock.calls[0]![0] as { messages: Array<Record<string, unknown>> };
      expect(params.messages[2]).toEqual({
        role: "tool",
        content: "42",
        toolCallId: "tc_01",
        name: "lookup",
      });
    });

    it("uses override model when provided", async () => {
      process.env.MISTRAL_API_KEY = "test-key";
      const provider = new MistralProvider();

      const mockResponse = {
        id: "chat-model",
        object: "chat.completion",
        model: "mistral-large-latest",
        choices: [
          { index: 0, message: { role: "assistant", content: "OK" }, finishReason: "stop" },
        ],
        usage: { promptTokens: 5, completionTokens: 1, totalTokens: 6 },
      };

      const completeSpy = vi
        .spyOn(
          (provider as unknown as { client: { chat: { complete: unknown } } }).client.chat,
          "complete",
        )
        .mockResolvedValue(mockResponse as never);

      await provider.generate({
        messages: [{ role: "user", content: "Hi" }],
        model: "mistral-large-latest",
      });

      const params = completeSpy.mock.calls[0]![0] as { model: string };
      expect(params.model).toBe("mistral-large-latest");
    });
  });
});
