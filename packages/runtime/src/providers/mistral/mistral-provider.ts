/**
 * Mistral AI implementation of the {@link ModelProvider} interface.
 *
 * Uses the official `@mistralai/mistralai` package to call the Chat Completions API.
 * Supports tool/function calling and token usage tracking.
 *
 * @category Providers
 */

import { Mistral } from "@mistralai/mistralai";
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
 * Configuration for the Mistral provider.
 *
 * @category Providers
 */
export interface MistralProviderConfig {
  /** Mistral API key. Falls back to `MISTRAL_API_KEY` env var if not set. */
  apiKey?: string;

  /** Server URL override (e.g. for proxies). */
  serverURL?: string;

  /** Default model to use (e.g. `"mistral-small-latest"`). */
  defaultModel?: string;

  /** Default max tokens for generation. */
  defaultMaxTokens?: number;
}

interface MistralMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  toolCalls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: Record<string, unknown> };
  }>;
  toolCallId?: string;
  name?: string;
}

function toMistralMessages(messages: ChatMessage[]): MistralMessage[] {
  return messages.map((msg) => {
    if (msg.role === "tool") {
      return {
        role: "tool" as const,
        content: msg.content,
        toolCallId: msg.toolCallId ?? "",
        name: msg.name,
      };
    }
    return {
      role: msg.role,
      content: msg.content,
    };
  });
}

function toMistralTools(
  tools: ToolDefinition[],
): Array<{
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function parseToolArgs(raw: Record<string, unknown> | string): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { _raw: raw };
    }
  }
  return raw;
}

interface MistralToolCall {
  id?: string;
  type?: string;
  function: {
    name: string;
    arguments: Record<string, unknown> | string;
  };
}

interface MistralChoice {
  index: number;
  message: {
    role?: string;
    content?: string | null;
    toolCalls?: MistralToolCall[] | null;
  };
  finishReason: string;
}

interface MistralUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

interface MistralChatResponse {
  id: string;
  choices: MistralChoice[];
  usage: MistralUsage;
}

function extractToolCalls(choice: MistralChoice): ToolCall[] {
  const calls = choice.message.toolCalls;
  if (!calls?.length) return [];

  return calls.map((tc, idx) => ({
    id: tc.id ?? `call_${idx}`,
    name: tc.function.name,
    arguments: parseToolArgs(tc.function.arguments),
  }));
}

function mapFinishReason(
  reason: string,
): GenerateResult["finishReason"] {
  switch (reason) {
    case "stop":
      return "stop";
    case "tool_calls":
      return "tool-calls";
    case "length":
    case "model_length":
      return "length";
    case "error":
      return "error";
    default:
      return "stop";
  }
}

function extractUsage(usage: MistralUsage): TokenUsage {
  return {
    promptTokens: usage.promptTokens ?? 0,
    completionTokens: usage.completionTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
  };
}

/**
 * Mistral AI model provider implementation.
 *
 * @category Providers
 */
export class MistralProvider implements ModelProvider {
  readonly name = "mistral";

  private readonly client: Mistral;
  private readonly defaultModel: string;
  private readonly defaultMaxTokens: number;

  constructor(config: MistralProviderConfig = {}) {
    const apiKey = config.apiKey ?? process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      throw new ProviderInitializationError(
        "The MISTRAL_API_KEY environment variable is missing or empty; either provide it, or instantiate the Mistral provider with an apiKey option.",
        { hint: "Hint: set environment variable `MISTRAL_API_KEY` for the Mistral provider." },
      );
    }

    try {
      this.client = new Mistral({
        apiKey,
        serverURL: config.serverURL,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ProviderInitializationError(
        `Failed to initialize Mistral client: ${msg}`,
        { hint: "Hint: verify your Mistral API key and provider configuration." },
      );
    }
    this.defaultModel = config.defaultModel ?? "mistral-small-latest";
    this.defaultMaxTokens = config.defaultMaxTokens ?? 4096;
  }

  supportsToolCalling(): boolean {
    return true;
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const model = options.model ?? this.defaultModel;
    const messages = toMistralMessages(options.messages);

    const params: Record<string, unknown> = {
      model,
      messages,
      maxTokens: options.maxTokens ?? this.defaultMaxTokens,
    };

    if (options.temperature !== undefined) {
      params.temperature = options.temperature;
    }

    if (options.tools?.length) {
      params.tools = toMistralTools(options.tools);
    }

    if (options.responseFormat) {
      params.responseFormat = { type: "json_object" };
    }

    const response = await this.client.chat.complete(
      params as Parameters<typeof this.client.chat.complete>[0],
    );

    const data = response as unknown as MistralChatResponse;
    const choice = data.choices[0];
    if (!choice) {
      return {
        content: "",
        toolCalls: [],
        finishReason: "error",
        usage: extractUsage(data.usage),
      };
    }

    const toolCalls = extractToolCalls(choice);

    return {
      content: choice.message.content ?? "",
      toolCalls,
      finishReason: mapFinishReason(choice.finishReason),
      usage: extractUsage(data.usage),
    };
  }
}
