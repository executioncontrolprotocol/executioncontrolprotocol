/**
 * Google Gemini implementation of the {@link ModelProvider} interface.
 *
 * Uses the official `@google/genai` package to call the Gemini API.
 * Supports tool/function calling, structured JSON output, and token usage tracking.
 *
 * @category Providers
 */

import { GoogleGenAI } from "@google/genai";
import type {
  Content,
  FunctionDeclaration,
  GenerateContentResponse,
} from "@google/genai";
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
 * Configuration for the Gemini provider.
 *
 * @category Providers
 */
export interface GeminiProviderConfig {
  /** Google AI API key. Falls back to `GEMINI_API_KEY` env var if not set. */
  apiKey?: string;

  /** Default model to use (e.g. `"gemini-2.5-flash"`). */
  defaultModel?: string;

  /** Default max tokens for generation. */
  defaultMaxTokens?: number;
}

function toGeminiContents(messages: ChatMessage[]): Content[] {
  const result: Content[] = [];
  for (const msg of messages) {
    if (msg.role === "system") continue;

    if (msg.role === "tool") {
      result.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: msg.name ?? "tool",
              response: safeParseFunctionResponse(msg.content),
            },
          },
        ],
      });
      continue;
    }

    const role = msg.role === "assistant" ? "model" : "user";
    result.push({
      role,
      parts: [{ text: msg.content }],
    });
  }
  return result;
}

function safeParseFunctionResponse(content: string): Record<string, unknown> {
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return { result: content };
  }
}

function extractSystemInstruction(messages: ChatMessage[]): string | undefined {
  const systemMessages = messages.filter((m) => m.role === "system");
  if (systemMessages.length === 0) return undefined;
  return systemMessages.map((m) => m.content).join("\n");
}

function toGeminiFunctionDeclarations(
  tools: ToolDefinition[],
): FunctionDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters as FunctionDeclaration["parameters"],
  }));
}

function extractToolCalls(response: GenerateContentResponse): ToolCall[] {
  const functionCalls = response.functionCalls;
  if (!functionCalls?.length) return [];

  return functionCalls.map((fc, idx) => ({
    id: fc.id ?? `call_${idx}`,
    name: fc.name ?? "",
    arguments: fc.args ?? {},
  }));
}

function extractTextContent(response: GenerateContentResponse): string {
  return response.text ?? "";
}

function mapFinishReason(
  reason: string | undefined,
): GenerateResult["finishReason"] {
  switch (reason) {
    case "STOP":
      return "stop";
    case "MAX_TOKENS":
      return "length";
    case "SAFETY":
    case "RECITATION":
    case "PROHIBITED_CONTENT":
      return "content-filter";
    default:
      return "stop";
  }
}

function extractUsage(response: GenerateContentResponse): TokenUsage {
  const meta = response.usageMetadata;
  return {
    promptTokens: meta?.promptTokenCount ?? 0,
    completionTokens: meta?.candidatesTokenCount ?? 0,
    totalTokens: meta?.totalTokenCount ?? 0,
  };
}

/**
 * Google Gemini model provider implementation.
 *
 * @category Providers
 */
export class GeminiProvider implements ModelProvider {
  readonly name = "gemini";

  private readonly client: GoogleGenAI;
  private readonly defaultModel: string;
  private readonly defaultMaxTokens: number;

  constructor(config: GeminiProviderConfig = {}) {
    const apiKey = config.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ProviderInitializationError(
        "The GEMINI_API_KEY environment variable is missing or empty; either provide it, or instantiate the Gemini provider with an apiKey option.",
        { hint: "Hint: set environment variable `GEMINI_API_KEY` for the Gemini provider." },
      );
    }

    try {
      this.client = new GoogleGenAI({ apiKey });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ProviderInitializationError(
        `Failed to initialize Gemini client: ${msg}`,
        { hint: "Hint: verify your Gemini API key and provider configuration." },
      );
    }
    this.defaultModel = config.defaultModel ?? "gemini-2.5-flash";
    this.defaultMaxTokens = config.defaultMaxTokens ?? 4096;
  }

  supportsToolCalling(): boolean {
    return true;
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const model = options.model ?? this.defaultModel;
    const contents = toGeminiContents(options.messages);
    const systemInstruction = extractSystemInstruction(options.messages);

    const config: Record<string, unknown> = {
      maxOutputTokens: options.maxTokens ?? this.defaultMaxTokens,
    };

    if (systemInstruction) {
      config.systemInstruction = systemInstruction;
    }

    if (options.temperature !== undefined) {
      config.temperature = options.temperature;
    }

    if (options.tools?.length) {
      config.tools = [
        { functionDeclarations: toGeminiFunctionDeclarations(options.tools) },
      ];
    }

    if (options.responseFormat) {
      config.responseMimeType = "application/json";
      config.responseSchema = options.responseFormat.schema;
    }

    if (options.signal) {
      config.abortSignal = options.signal;
    }

    const response = await this.client.models.generateContent({
      model,
      contents,
      config,
    });

    const candidate = response.candidates?.[0];
    const toolCalls = extractToolCalls(response);

    return {
      content: extractTextContent(response),
      toolCalls,
      finishReason: mapFinishReason(candidate?.finishReason),
      usage: extractUsage(response),
    };
  }
}
