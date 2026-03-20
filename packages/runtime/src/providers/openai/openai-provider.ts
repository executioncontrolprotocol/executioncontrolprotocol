/**
 * OpenAI implementation of the {@link ModelProvider} interface.
 *
 * Uses the official `openai` npm package to call the Chat Completions API.
 * Supports tool/function calling, structured JSON output, and token usage tracking.
 *
 * @category Providers
 */

import OpenAI from "openai";
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
 * Configuration for the OpenAI provider.
 *
 * @category Providers
 */
export interface OpenAIProviderConfig {
  /** OpenAI API key. Falls back to `OPENAI_API_KEY` env var if not set. */
  apiKey?: string;

  /** Base URL override (e.g. for Azure OpenAI or proxies). */
  baseURL?: string;

  /** Default model to use (e.g. `"gpt-4o"`, `"gpt-4o-mini"`). */
  defaultModel?: string;

  /** Default max tokens for generation. */
  defaultMaxTokens?: number;

  /** Organization ID for OpenAI API requests. */
  organization?: string;
}

function toOpenAIMessages(
  messages: ChatMessage[],
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return messages.map((msg) => {
    switch (msg.role) {
      case "system":
        return {
          role: "system" as const,
          content: msg.content,
        };
      case "user":
        return {
          role: "user" as const,
          content: msg.content,
        };
      case "assistant":
        return {
          role: "assistant" as const,
          content: msg.content,
        };
      case "tool":
        return {
          role: "tool" as const,
          content: msg.content,
          tool_call_id: msg.toolCallId ?? "",
        };
    }
  });
}

function toOpenAITools(
  tools: ToolDefinition[],
): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as OpenAI.FunctionParameters,
    },
  }));
}

function extractToolCalls(
  choice: OpenAI.Chat.Completions.ChatCompletion.Choice,
): ToolCall[] {
  const calls = choice.message.tool_calls;
  if (!calls?.length) return [];

  return calls.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: parseToolArgs(tc.function.arguments),
  }));
}

function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { _raw: raw };
  }
}

function mapFinishReason(
  reason: string | null,
): GenerateResult["finishReason"] {
  switch (reason) {
    case "stop":
      return "stop";
    case "tool_calls":
      return "tool-calls";
    case "length":
      return "length";
    case "content_filter":
      return "content-filter";
    default:
      return "stop";
  }
}

function extractUsage(
  usage: OpenAI.Completions.CompletionUsage | undefined,
): TokenUsage {
  return {
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
    totalTokens: usage?.total_tokens ?? 0,
  };
}

/**
 * OpenAI model provider implementation.
 *
 * @category Providers
 */
export class OpenAIProvider implements ModelProvider {
  readonly name = "openai";

  private readonly client: OpenAI;
  private readonly defaultModel: string;
  private readonly defaultMaxTokens: number;

  constructor(config: OpenAIProviderConfig = {}) {
    const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ProviderInitializationError(
        "The OPENAI_API_KEY environment variable is missing or empty; either provide it, or instantiate the OpenAI client with an apiKey option.",
        { hint: "Hint: set environment variable `OPENAI_API_KEY` for the OpenAI provider." },
      );
    }

    try {
      this.client = new OpenAI({
        apiKey,
        baseURL: config.baseURL,
        organization: config.organization,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ProviderInitializationError(
        `Failed to initialize OpenAI client: ${msg}`,
        { hint: "Hint: verify your OpenAI API key and provider configuration." },
      );
    }
    this.defaultModel = config.defaultModel ?? "gpt-4o";
    this.defaultMaxTokens = config.defaultMaxTokens ?? 4096;
  }

  supportsToolCalling(): boolean {
    return true;
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const model = options.model ?? this.defaultModel;
    const messages = toOpenAIMessages(options.messages);

    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model,
      messages,
      max_tokens: options.maxTokens ?? this.defaultMaxTokens,
      temperature: options.temperature,
    };

    if (options.tools?.length) {
      params.tools = toOpenAITools(options.tools);
    }

    if (options.responseFormat) {
      params.response_format = {
        type: "json_schema" as const,
        json_schema: {
          name: "response",
          strict: true,
          schema: options.responseFormat.schema,
        },
      };
    }

    const response = await this.client.chat.completions.create(params, {
      signal: options.signal ?? undefined,
    });

    const choice = response.choices[0];
    if (!choice) {
      return {
        content: "",
        toolCalls: [],
        finishReason: "error",
        usage: extractUsage(response.usage),
      };
    }

    return {
      content: choice.message.content ?? "",
      toolCalls: extractToolCalls(choice),
      finishReason: mapFinishReason(choice.finish_reason),
      usage: extractUsage(response.usage),
    };
  }
}
