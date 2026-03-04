/**
 * Abstract interface for LLM model providers.
 *
 * Implementations bridge the ECP engine to specific model APIs (OpenAI,
 * Anthropic, Ollama, etc.) while keeping the engine itself provider-agnostic.
 *
 * @category Providers
 */

/**
 * A single message in a conversation with a model.
 *
 * @category Providers
 */
export interface ChatMessage {
  /** The role of the message author. */
  role: "system" | "user" | "assistant" | "tool";

  /** Text content of the message. */
  content: string;

  /** Optional tool-call ID this message responds to. */
  toolCallId?: string;

  /** Optional name for the author (e.g. tool name). */
  name?: string;
}

/**
 * A tool definition the model can choose to call during generation.
 *
 * @category Providers
 */
export interface ToolDefinition {
  /** Unique tool name (e.g. `"jira:issues.search"`). */
  name: string;

  /** Human-readable description of what the tool does. */
  description: string;

  /**
   * JSON Schema describing the tool's parameters.
   * Passed to the model as the function's input schema.
   */
  parameters: Record<string, unknown>;
}

/**
 * A tool call requested by the model.
 *
 * @category Providers
 */
export interface ToolCall {
  /** Unique ID for this tool call (used to match results). */
  id: string;

  /** The tool name the model wants to invoke. */
  name: string;

  /** The arguments the model provided, as a parsed object. */
  arguments: Record<string, unknown>;
}

/**
 * The result of a model generation request.
 *
 * @category Providers
 */
export interface GenerateResult {
  /** The text content of the model's response (may be empty if tool calls are present). */
  content: string;

  /** Tool calls the model wants to make (empty array if none). */
  toolCalls: ToolCall[];

  /** The reason the model stopped generating. */
  finishReason: "stop" | "tool-calls" | "length" | "content-filter" | "error";

  /** Token usage for this generation. */
  usage: TokenUsage;
}

/**
 * Token counts for a generation request.
 *
 * @category Providers
 */
export interface TokenUsage {
  /** Tokens consumed by the prompt/input. */
  promptTokens: number;

  /** Tokens generated in the response. */
  completionTokens: number;

  /** Total tokens (prompt + completion). */
  totalTokens: number;
}

/**
 * Options for a generation request.
 *
 * @category Providers
 */
export interface GenerateOptions {
  /** The conversation messages to send. */
  messages: ChatMessage[];

  /** Model identifier override (e.g. `"gpt-4o"`). Falls back to executor config. */
  model?: string;

  /** Tools the model may call during generation. */
  tools?: ToolDefinition[];

  /** Controls randomness. 0 = deterministic, 1 = creative. */
  temperature?: number;

  /** Maximum tokens to generate. */
  maxTokens?: number;

  /**
   * If set, the model should output structured JSON conforming
   * to this schema.
   */
  responseFormat?: {
    type: "json-schema";
    schema: Record<string, unknown>;
  };

  /** Abort signal for cancellation. */
  signal?: AbortSignal;
}

/**
 * Provider interface for LLM model access.
 *
 * Each implementation wraps a specific model API while exposing
 * a uniform interface to the ECP engine.
 *
 * @category Providers
 */
export interface ModelProvider {
  /** Human-readable provider name (e.g. `"openai"`, `"ollama"`). */
  readonly name: string;

  /**
   * Send a generation request to the model.
   *
   * @param options - The messages, tools, and configuration for this request.
   * @returns The model's response including content, tool calls, and usage.
   */
  generate(options: GenerateOptions): Promise<GenerateResult>;

  /**
   * Whether this provider's models support native tool/function calling.
   * If `false`, the engine must use prompt-based tool invocation.
   */
  supportsToolCalling(): boolean;
}
