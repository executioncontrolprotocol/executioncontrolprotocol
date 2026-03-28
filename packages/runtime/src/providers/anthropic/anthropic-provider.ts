/**
 * Anthropic implementation of the {@link ModelProvider} interface.
 *
 * Uses the official `@anthropic-ai/sdk` package to call the Messages API.
 * Supports tool/function calling, structured JSON output, and token usage tracking.
 *
 * @category Providers
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  ChatMessage,
  GenerateOptions,
  GenerateResult,
  ModelProvider,
  ToolCall,
  ToolDefinition,
  TokenUsage,
} from "../model-provider.js";
import { ProviderInitializationError } from "../provider-init-error.js";

/**
 * Configuration for the Anthropic provider.
 *
 * @category Providers
 */
export interface AnthropicProviderConfig {
  /** Anthropic API key. Falls back to `ANTHROPIC_API_KEY` env var if not set. */
  apiKey?: string;

  /** Base URL override (e.g. for proxies). */
  baseURL?: string;

  /** Default model to use (e.g. `"claude-sonnet-4-20250514"`). */
  defaultModel?: string;

  /** Default max tokens for generation. */
  defaultMaxTokens?: number;
}

function toAnthropicMessages(
  messages: ChatMessage[],
): Anthropic.Messages.MessageParam[] {
  const result: Anthropic.Messages.MessageParam[] = [];
  for (const msg of messages) {
    if (msg.role === "system") continue;

    if (msg.role === "tool") {
      result.push({
        role: "user" as const,
        content: [
          {
            type: "tool_result" as const,
            tool_use_id: msg.toolCallId ?? "",
            content: msg.content,
          },
        ],
      });
      continue;
    }

    result.push({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    });
  }
  return result;
}

function extractSystemPrompt(messages: ChatMessage[]): string | undefined {
  const systemMessages = messages.filter((m) => m.role === "system");
  if (systemMessages.length === 0) return undefined;
  return systemMessages.map((m) => m.content).join("\n");
}

function toAnthropicTools(
  tools: ToolDefinition[],
): Anthropic.Messages.Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as Anthropic.Messages.Tool.InputSchema,
  }));
}

function extractToolCalls(
  response: Anthropic.Messages.Message,
): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const block of response.content) {
    if (block.type === "tool_use") {
      calls.push({
        id: block.id,
        name: block.name,
        arguments: (block.input ?? {}) as Record<string, unknown>,
      });
    }
  }
  return calls;
}

function extractTextContent(response: Anthropic.Messages.Message): string {
  const parts: string[] = [];
  for (const block of response.content) {
    if (block.type === "text") {
      parts.push(block.text);
    }
  }
  return parts.join("");
}

function mapFinishReason(
  reason: Anthropic.Messages.Message["stop_reason"],
): GenerateResult["finishReason"] {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "tool_use":
      return "tool-calls";
    case "max_tokens":
      return "length";
    default:
      return "stop";
  }
}

function extractUsage(
  usage: Anthropic.Messages.Usage,
): TokenUsage {
  return {
    promptTokens: usage.input_tokens ?? 0,
    completionTokens: usage.output_tokens ?? 0,
    totalTokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
  };
}

/**
 * Anthropic model provider implementation.
 *
 * @category Providers
 */
export class AnthropicProvider implements ModelProvider {
  readonly name = "anthropic";

  private readonly client: Anthropic;
  private readonly defaultModel: string;
  private readonly defaultMaxTokens: number;

  constructor(config: AnthropicProviderConfig = {}) {
    const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new ProviderInitializationError(
        "The ANTHROPIC_API_KEY environment variable is missing or empty; either provide it, or instantiate the Anthropic client with an apiKey option.",
        { hint: "Hint: set environment variable `ANTHROPIC_API_KEY` for the Anthropic provider." },
      );
    }

    try {
      this.client = new Anthropic({
        apiKey,
        baseURL: config.baseURL ?? undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ProviderInitializationError(
        `Failed to initialize Anthropic client: ${msg}`,
        { hint: "Hint: verify your Anthropic API key and provider configuration." },
      );
    }
    this.defaultModel = config.defaultModel ?? "claude-sonnet-4-20250514";
    this.defaultMaxTokens = config.defaultMaxTokens ?? 4096;
  }

  supportsToolCalling(): boolean {
    return true;
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const model = options.model ?? this.defaultModel;
    const messages = toAnthropicMessages(options.messages);
    const systemPrompt = extractSystemPrompt(options.messages);

    const params: Anthropic.Messages.MessageCreateParamsNonStreaming = {
      model,
      messages,
      max_tokens: options.maxTokens ?? this.defaultMaxTokens,
      stream: false,
    };

    if (systemPrompt) {
      params.system = systemPrompt;
    }

    if (options.temperature !== undefined) {
      params.temperature = options.temperature;
    }

    if (options.tools?.length) {
      params.tools = toAnthropicTools(options.tools);
    }

    const response = await this.client.messages.create(params, {
      signal: options.signal ?? undefined,
    });

    const toolCalls = extractToolCalls(response);

    return {
      content: extractTextContent(response),
      toolCalls,
      finishReason: mapFinishReason(response.stop_reason),
      usage: extractUsage(response.usage),
    };
  }
}
