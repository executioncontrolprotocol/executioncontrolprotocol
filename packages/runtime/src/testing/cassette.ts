/**
 * Cassette record/replay system for deterministic test runs.
 *
 * Records all model calls, tool calls, and delegations during a run,
 * then replays them to produce identical results without network.
 *
 * @category Testing
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * A single recorded interaction in a cassette.
 *
 * @category Testing
 */
export interface CassetteEntry {
  /** Interaction type. */
  type: "model-call" | "tool-call" | "delegation";

  /** Timestamp of the interaction. */
  timestamp: string;

  /** The request sent. */
  request: Record<string, unknown>;

  /** The response received. */
  response: Record<string, unknown>;
}

/**
 * A complete cassette recording of a run.
 *
 * @category Testing
 */
export interface Cassette {
  /** The context name this cassette was recorded from. */
  contextName: string;

  /** When the recording was made. */
  recordedAt: string;

  /** Ordered sequence of interactions. */
  entries: CassetteEntry[];
}

/**
 * Load a cassette from disk.
 *
 * @param path - File path to the cassette JSON.
 * @returns The loaded cassette.
 *
 * @category Testing
 */
export function loadCassette(path: string): Cassette {
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as Cassette;
}

/**
 * Save a cassette to disk.
 *
 * @param cassette - The cassette to save.
 * @param path - File path to write to.
 *
 * @category Testing
 */
export function saveCassette(cassette: Cassette, path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(cassette, null, 2));
}

/**
 * A cassette recorder that captures interactions during a run.
 *
 * @category Testing
 */
export class CassetteRecorder {
  private entries: CassetteEntry[] = [];
  private contextName = "";

  setContextName(name: string): void {
    this.contextName = name;
  }

  recordModelCall(
    request: Record<string, unknown>,
    response: Record<string, unknown>,
  ): void {
    this.entries.push({
      type: "model-call",
      timestamp: new Date().toISOString(),
      request,
      response,
    });
  }

  recordToolCall(
    request: Record<string, unknown>,
    response: Record<string, unknown>,
  ): void {
    this.entries.push({
      type: "tool-call",
      timestamp: new Date().toISOString(),
      request,
      response,
    });
  }

  recordDelegation(
    request: Record<string, unknown>,
    response: Record<string, unknown>,
  ): void {
    this.entries.push({
      type: "delegation",
      timestamp: new Date().toISOString(),
      request,
      response,
    });
  }

  toCassette(): Cassette {
    return {
      contextName: this.contextName,
      recordedAt: new Date().toISOString(),
      entries: [...this.entries],
    };
  }

  reset(): void {
    this.entries = [];
    this.contextName = "";
  }
}

/**
 * A cassette replayer that provides pre-recorded responses.
 *
 * @category Testing
 */
export class CassetteReplayer {
  private modelCallIndex = 0;
  private toolCallIndex = 0;
  private delegationIndex = 0;
  private readonly modelCalls: CassetteEntry[];
  private readonly toolCalls: CassetteEntry[];
  private readonly delegationCalls: CassetteEntry[];

  constructor(cassette: Cassette) {
    this.modelCalls = cassette.entries.filter((e) => e.type === "model-call");
    this.toolCalls = cassette.entries.filter((e) => e.type === "tool-call");
    this.delegationCalls = cassette.entries.filter((e) => e.type === "delegation");
  }

  nextModelResponse(): Record<string, unknown> | undefined {
    const entry = this.modelCalls[this.modelCallIndex];
    this.modelCallIndex++;
    return entry?.response;
  }

  nextToolResponse(): Record<string, unknown> | undefined {
    const entry = this.toolCalls[this.toolCallIndex];
    this.toolCallIndex++;
    return entry?.response;
  }

  nextDelegationResponse(): Record<string, unknown> | undefined {
    const entry = this.delegationCalls[this.delegationIndex];
    this.delegationIndex++;
    return entry?.response;
  }

  get exhausted(): boolean {
    return (
      this.modelCallIndex >= this.modelCalls.length &&
      this.toolCallIndex >= this.toolCalls.length &&
      this.delegationIndex >= this.delegationCalls.length
    );
  }
}
