import { describe, expect, it, vi, beforeEach } from "vitest";

import { AnthropicProvider } from "../src/providers/anthropic/anthropic-provider.js";
import { ProviderInitializationError } from "../src/providers/provider-init-error.js";

describe("AnthropicProvider", () => {
  const originalEnv = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = originalEnv;
  });

  describe("constructor", () => {
    it("throws ProviderInitializationError when no API key", () => {
      delete process.env.ANTHROPIC_API_KEY;
      expect(() => new AnthropicProvider()).toThrow(ProviderInitializationError);
      expect(() => new AnthropicProvider()).toThrow(/ANTHROPIC_API_KEY/);
    });

    it("provides a hint about ANTHROPIC_API_KEY", () => {
      delete process.env.ANTHROPIC_API_KEY;
      try {
        new AnthropicProvider();
      } catch (err) {
        expect(err).toBeInstanceOf(ProviderInitializationError);
        expect((err as ProviderInitializationError).hint).toMatch(/ANTHROPIC_API_KEY/);
      }
    });

    it("accepts explicit apiKey config", () => {
      delete process.env.ANTHROPIC_API_KEY;
      const provider = new AnthropicProvider({ apiKey: "test-key" });
      expect(provider.name).toBe("anthropic");
    });

    it("reads ANTHROPIC_API_KEY from env", () => {
      process.env.ANTHROPIC_API_KEY = "env-key";
      const provider = new AnthropicProvider();
      expect(provider.name).toBe("anthropic");
    });

    it("has correct name", () => {
      process.env.ANTHROPIC_API_KEY = "test";
      const provider = new AnthropicProvider();
      expect(provider.name).toBe("anthropic");
    });
  });

  describe("supportsToolCalling", () => {
    it("returns true", () => {
      process.env.ANTHROPIC_API_KEY = "test";
      const provider = new AnthropicProvider();
      expect(provider.supportsToolCalling()).toBe(true);
    });
  });

  describe("generate", () => {
    it("calls Anthropic messages.create with correct params", async () => {
      process.env.ANTHROPIC_API_KEY = "test-key";
      const provider = new AnthropicProvider();

      const mockResponse = {
        id: "msg_123",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "Hello!" }],
        model: "claude-sonnet-4-20250514",
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      const createSpy = vi
        .spyOn((provider as unknown as { client: { messages: { create: unknown } } }).client.messages, "create")
        .mockResolvedValue(mockResponse as never);

      const result = await provider.generate({
        messages: [
          { role: "system", content: "You are helpful." },
          { role: "user", content: "Hi" },
        ],
      });

      expect(createSpy).toHaveBeenCalledOnce();
      const callArgs = createSpy.mock.calls[0]!;
      const params = callArgs[0] as Record<string, unknown>;
      expect(params.model).toBe("claude-sonnet-4-20250514");
      expect(params.system).toBe("You are helpful.");
      expect(params.stream).toBe(false);
      expect(params.messages).toEqual([{ role: "user", content: "Hi" }]);

      expect(result.content).toBe("Hello!");
      expect(result.finishReason).toBe("stop");
      expect(result.toolCalls).toEqual([]);
      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });
    });

    it("handles tool_use response", async () => {
      process.env.ANTHROPIC_API_KEY = "test-key";
      const provider = new AnthropicProvider();

      const mockResponse = {
        id: "msg_456",
        type: "message",
        role: "assistant",
        content: [
          { type: "text", text: "Let me search." },
          {
            type: "tool_use",
            id: "toolu_01",
            name: "search",
            input: { query: "test" },
          },
        ],
        model: "claude-sonnet-4-20250514",
        stop_reason: "tool_use",
        usage: { input_tokens: 20, output_tokens: 15 },
      };

      vi.spyOn(
        (provider as unknown as { client: { messages: { create: unknown } } }).client.messages,
        "create",
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
        id: "toolu_01",
        name: "search",
        arguments: { query: "test" },
      });
      expect(result.content).toBe("Let me search.");
    });

    it("handles tool result messages", async () => {
      process.env.ANTHROPIC_API_KEY = "test-key";
      const provider = new AnthropicProvider();

      const mockResponse = {
        id: "msg_789",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "The result is 42." }],
        model: "claude-sonnet-4-20250514",
        stop_reason: "end_turn",
        usage: { input_tokens: 30, output_tokens: 10 },
      };

      const createSpy = vi
        .spyOn((provider as unknown as { client: { messages: { create: unknown } } }).client.messages, "create")
        .mockResolvedValue(mockResponse as never);

      await provider.generate({
        messages: [
          { role: "user", content: "What is the answer?" },
          { role: "assistant", content: "Let me look." },
          { role: "tool", content: "42", toolCallId: "toolu_01" },
        ],
      });

      const callArgs = createSpy.mock.calls[0]!;
      const params = callArgs[0] as { messages: Array<{ role: string; content: unknown }> };
      expect(params.messages).toEqual([
        { role: "user", content: "What is the answer?" },
        { role: "assistant", content: "Let me look." },
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "toolu_01", content: "42" },
          ],
        },
      ]);
    });

    it("maps max_tokens stop reason to length", async () => {
      process.env.ANTHROPIC_API_KEY = "test-key";
      const provider = new AnthropicProvider();

      const mockResponse = {
        id: "msg_len",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "Truncated..." }],
        model: "claude-sonnet-4-20250514",
        stop_reason: "max_tokens",
        usage: { input_tokens: 10, output_tokens: 4096 },
      };

      vi.spyOn(
        (provider as unknown as { client: { messages: { create: unknown } } }).client.messages,
        "create",
      ).mockResolvedValue(mockResponse as never);

      const result = await provider.generate({
        messages: [{ role: "user", content: "Write a long essay" }],
      });

      expect(result.finishReason).toBe("length");
    });

    it("uses override model when provided", async () => {
      process.env.ANTHROPIC_API_KEY = "test-key";
      const provider = new AnthropicProvider();

      const mockResponse = {
        id: "msg_model",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "OK" }],
        model: "claude-haiku-35-20241022",
        stop_reason: "end_turn",
        usage: { input_tokens: 5, output_tokens: 1 },
      };

      const createSpy = vi
        .spyOn((provider as unknown as { client: { messages: { create: unknown } } }).client.messages, "create")
        .mockResolvedValue(mockResponse as never);

      await provider.generate({
        messages: [{ role: "user", content: "Hi" }],
        model: "claude-haiku-35-20241022",
      });

      const params = createSpy.mock.calls[0]![0] as { model: string };
      expect(params.model).toBe("claude-haiku-35-20241022");
    });
  });
});
