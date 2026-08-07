import {
  buildRepairHintFromFixture,
  buildSystemPromptFromFixture,
} from "@executioncontrolprotocol/core"
import { loadCodingHarnessPromptFixture } from "./load-harness-prompt.js"

/**
 * Build the system prompt for a Browser Coding harness prompt fixture id.
 * @category Harness
 */
export function buildCodingSystemPrompt(fixtureId: string): string {
  return buildSystemPromptFromFixture(loadCodingHarnessPromptFixture(fixtureId))
}

/**
 * Build repair-line text for a Browser Coding harness prompt fixture id.
 * @category Harness
 */
export function buildCodingRepairHint(fixtureId: string): string {
  return buildRepairHintFromFixture(loadCodingHarnessPromptFixture(fixtureId))
}
