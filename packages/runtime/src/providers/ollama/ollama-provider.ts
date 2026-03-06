/**
 * Ollama implementation of the {@link ModelProvider} interface.
 *
 * Uses Ollama's native REST API (`/api/chat`) so there is no dependency
 * on the OpenAI SDK. Supports JSON-mode output and tool/function calling.
 *
 * @category Providers
 */

import type {
  ChatMessage,
  GenerateOptions,
  GenerateResult,
  ModelProvider,
  ToolCall,
  ToolDefinition,
  TokenUsage,
} from "../model-provider.js";

/**
 * Configuration for the Ollama provider.
 *
 * @category Providers
 */
export interface OllamaProviderConfig {
  /** Base URL for the Ollama server. Defaults to `http://localhost:11434`. */
  baseURL?: string;

  /** Default model to use (e.g. `"gemma3:1b"`). */
  defaultModel?: string;

  /** Request timeout in milliseconds. Defaults to 120 000 (2 min). */
  timeoutMs?: number;
}

/** Shape of a single message in the Ollama chat API request. */
interface OllamaChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

/** Shape of an Ollama tool definition. */
interface OllamaTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** Shape of the Ollama `/api/chat` response body. */
interface OllamaChatResponse {
  model: string;
  message: {
    role: string;
    content: string;
    tool_calls?: Array<{
      function: {
        name: string;
        arguments: Record<string, unknown>;
      };
    }>;
  };
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

function toOllamaMessages(messages: ChatMessage[]): OllamaChatMessage[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

function toOllamaTools(tools: ToolDefinition[]): OllamaTool[] {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function extractToolCalls(
  response: OllamaChatResponse,
): ToolCall[] {
  const calls = response.message.tool_calls;
  if (!calls?.length) return [];

  return calls.map((tc, idx) => ({
    id: `call_${idx}`,
    name: tc.function.name,
    arguments: tc.function.arguments,
  }));
}

function extractUsage(response: OllamaChatResponse): TokenUsage {
  const prompt = response.prompt_eval_count ?? 0;
  const completion = response.eval_count ?? 0;
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: prompt + completion,
  };
}

/**
 * Ollama model provider implementation.
 *
 * Connects to a locally-running (or remote) Ollama instance via its
 * native HTTP API. Ideal for CI pipelines and local development with
 * open-weight models.
 *
 * @category Providers
 */
export class OllamaProvider implements ModelProvider {
  readonly name = "ollama";

  private readonly baseURL: string;
  private readonly defaultModel: string;
  private readonly timeoutMs: number;

  constructor(config: OllamaProviderConfig = {}) {
    this.baseURL = (config.baseURL ?? "http://localhost:11434").replace(
      /\/$/,
      "",
    );
    this.defaultModel = config.defaultModel ?? "gemma3:1b";
    this.timeoutMs = config.timeoutMs ?? 120_000;
  }

  supportsToolCalling(): boolean {
    return true;
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const model = options.model ?? this.defaultModel;
    const messages = toOllamaMessages(options.messages);

    const body: Record<string, unknown> = {
      model,
      messages,
      stream: false,
    };

    if (options.tools?.length) {
      body.tools = toOllamaTools(options.tools);
    }

    if (options.responseFormat) {
      body.format = "json";
    }

    if (options.temperature !== undefined) {
      body.options = { temperature: options.temperature };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    if (options.signal) {
      options.signal.addEventListener("abort", () => controller.abort());
    }

    try {
      const response = await fetch(`${this.baseURL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `Ollama API error (${response.status}): ${text}`,
        );
      }

      const data = (await response.json()) as OllamaChatResponse;
      const toolCalls = extractToolCalls(data);

      return {
        content: data.message.content ?? "",
        toolCalls,
        finishReason: toolCalls.length > 0 ? "tool-calls" : "stop",
        usage: extractUsage(data),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
