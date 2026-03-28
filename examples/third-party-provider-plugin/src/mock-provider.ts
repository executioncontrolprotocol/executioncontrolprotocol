/**
 * Mock model provider demonstrating the ECP third-party plugin contract.
 *
 * This provider does not call any real API. It returns deterministic
 * responses, echoing the last user message and exercising tool calling
 * when tools are supplied. It exists purely to show how a third-party
 * package can implement {@link ModelProvider} using only the public
 * types from `@executioncontrolprotocol/plugins`.
 */

import type {
  ChatMessage,
  GenerateOptions,
  GenerateResult,
  ModelProvider,
  TokenUsage,
  ToolCall,
} from "@executioncontrolprotocol/plugins";

/**
 * Configuration accepted by the mock provider.
 */
export interface MockProviderConfig {
  /** Default model identifier to report. */
  defaultModel?: string;

  /** Fixed latency (ms) to simulate per call. 0 = no delay. */
  latencyMs?: number;
}

function lastUserContent(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === "user") return messages[i]!.content;
  }
  return "";
}

/**
 * A mock {@link ModelProvider} for testing and demonstration purposes.
 *
 * Behavior:
 * - When tools are provided, the first call returns a single tool call
 *   for the first available tool with `{ "input": "<user message>" }`.
 * - When no tools are provided (or after tool results are fed back),
 *   it returns `"[mock] <last user message>"` as content.
 */
export class MockProvider implements ModelProvider {
  readonly name = "example-provider";

  private readonly defaultModel: string;
  private readonly latencyMs: number;

  constructor(config: MockProviderConfig = {}) {
    this.defaultModel = config.defaultModel ?? "mock-model-v1";
    this.latencyMs = config.latencyMs ?? 0;
  }

  supportsToolCalling(): boolean {
    return true;
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }

    const model = options.model ?? this.defaultModel;
    const userContent = lastUserContent(options.messages);

    const hasToolResults = options.messages.some((m) => m.role === "tool");
    const shouldCallTool = options.tools?.length && !hasToolResults;

    const usage: TokenUsage = {
      promptTokens: userContent.length,
      completionTokens: 0,
      totalTokens: userContent.length,
    };

    if (shouldCallTool) {
      const tool = options.tools![0]!;
      const toolCalls: ToolCall[] = [
        {
          id: `mock_call_${Date.now()}`,
          name: tool.name,
          arguments: { input: userContent },
        },
      ];
      usage.completionTokens = JSON.stringify(toolCalls).length;
      usage.totalTokens = usage.promptTokens + usage.completionTokens;

      return {
        content: "",
        toolCalls,
        finishReason: "tool-calls",
        usage,
      };
    }

    const content = `[mock/${model}] ${userContent}`;
    usage.completionTokens = content.length;
    usage.totalTokens = usage.promptTokens + usage.completionTokens;

    return {
      content,
      toolCalls: [],
      finishReason: "stop",
      usage,
    };
  }
}
