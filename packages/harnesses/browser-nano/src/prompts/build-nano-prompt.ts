import {
  buildRepairHintFromFixture,
  buildSystemPromptFromFixture,
} from "@executioncontrolprotocol/core"
import { loadNanoHarnessPromptFixture } from "./load-harness-prompt.js"

/**
 * Build the system prompt for a Browser Nano harness prompt fixture id.
 * @category Harness
 */
export function buildNanoSystemPrompt(fixtureId: string): string {
  return buildSystemPromptFromFixture(loadNanoHarnessPromptFixture(fixtureId))
}

/**
 * Build repair-line text for a Browser Nano harness prompt fixture id.
 * @category Harness
 */
export function buildNanoRepairHint(fixtureId: string): string {
  return buildRepairHintFromFixture(loadNanoHarnessPromptFixture(fixtureId))
}
