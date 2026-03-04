/**
 * Mock model provider for deterministic testing.
 *
 * Supports pre-programmed responses, tool call sequences, and
 * cassette-based record/replay.
 *
 * @category Testing
 */

import type {
  ModelProvider,
  GenerateOptions,
  GenerateResult,
  TokenUsage,
} from "../providers/model-provider.js";

/**
 * A pre-programmed response the mock will return for a given call.
 *
 * @category Testing
 */
export interface MockResponse {
  content: string;
  toolCalls?: GenerateResult["toolCalls"];
  finishReason?: GenerateResult["finishReason"];
  usage?: Partial<TokenUsage>;
}

/**
 * A recorded call made to the mock provider.
 *
 * @category Testing
 */
export interface RecordedCall {
  messages: GenerateOptions["messages"];
  model?: string;
  tools?: GenerateOptions["tools"];
  temperature?: number;
  timestamp: string;
}

/**
 * Mock implementation of {@link ModelProvider} for unit testing.
 *
 * Responses are queued and returned in FIFO order. If no responses
 * are queued, returns a default empty response.
 *
 * @category Testing
 */
export class MockModelProvider implements ModelProvider {
  readonly name = "mock";

  private responses: MockResponse[] = [];
  private callIndex = 0;
  readonly calls: RecordedCall[] = [];

  /**
   * Queue one or more responses that will be returned in order.
   */
  addResponses(...responses: MockResponse[]): this {
    this.responses.push(...responses);
    return this;
  }

  /**
   * Queue a simple text response.
   */
  addTextResponse(content: string): this {
    return this.addResponses({ content });
  }

  /**
   * Queue a JSON response (stringified automatically).
   */
  addJsonResponse(data: Record<string, unknown>): this {
    return this.addResponses({ content: JSON.stringify(data) });
  }

  /**
   * Queue a tool-call response.
   */
  addToolCallResponse(
    toolCalls: GenerateResult["toolCalls"],
    content = "",
  ): this {
    return this.addResponses({
      content,
      toolCalls,
      finishReason: "tool-calls",
    });
  }

  supportsToolCalling(): boolean {
    return true;
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    this.calls.push({
      messages: options.messages,
      model: options.model,
      tools: options.tools,
      temperature: options.temperature,
      timestamp: new Date().toISOString(),
    });

    const response = this.responses[this.callIndex];
    this.callIndex++;

    if (!response) {
      return {
        content: '{"error": "no mock response configured"}',
        toolCalls: [],
        finishReason: "stop",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }

    return {
      content: response.content,
      toolCalls: response.toolCalls ?? [],
      finishReason: response.finishReason ?? "stop",
      usage: {
        promptTokens: response.usage?.promptTokens ?? 100,
        completionTokens: response.usage?.completionTokens ?? 50,
        totalTokens: response.usage?.totalTokens ?? 150,
      },
    };
  }

  /**
   * Reset all queued responses and recorded calls.
   */
  reset(): void {
    this.responses = [];
    this.callIndex = 0;
    this.calls.length = 0;
  }
}
