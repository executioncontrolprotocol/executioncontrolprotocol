/** Deterministic model generate handler for framework unit tests. @category Testing */

export interface TestModelGenerateInput {
  /** User prompt text. */
  prompt?: string
  /** Optional system prompt. */
  system?: string
}

function testIntentResponse(prompt: string): string {
  const lower = prompt.toLowerCase()
  let intent = "general"
  if (/create.*workflow|new workflow|sends.*email|build a workflow/.test(lower)) {
    intent = "workflow-create"
  } else if (/update|patch|change.*step|modify.*workflow|failed on|help me fix/.test(lower)) {
    intent = "workflow-patch"
  } else if (/what is ecp|how does|how do|execution control protocol/.test(lower)) {
    intent = "faq"
  }
  return `INTENT ${intent}`
}

function testAssistantResponse(prompt: string): string {
  const msgMatch = prompt.match(/User message:\s*(.+?)(?:\n|$)/i)
  const message = (msgMatch?.[1] ?? prompt).toLowerCase()
  if (/what is ecp|execution control protocol/.test(message)) {
    return 'REPLY\n  ANSWER "ECP is the Execution Control Protocol: portable workflows run in governed environments that bind tools, models, policies, and runtimes."'
  }
  if (/what can you do|what are you good at/.test(message)) {
    return 'REPLY\n  ANSWER "I build and patch ECP workflows, answer ECP questions, and explain capabilities registered in this environment. I cannot install extensions."'
  }
  if (/register|install.*extension/.test(message)) {
    return 'REPLY\n  ANSWER "I cannot register or install extensions. I can list loaded capabilities and help you build workflows with them."'
  }
  if (/capabilit|extensions?|plugins?/.test(message)) {
    return 'REPLY\n  ANSWER "Loaded capabilities include @executioncontrolprotocol/test.echo and @executioncontrolprotocol/test.summarize, @executioncontrolprotocol/test.validate, @executioncontrolprotocol/test.notify, @executioncontrolprotocol/test.translate."\n  CITATION extension @executioncontrolprotocol/test "@executioncontrolprotocol/test.echo"'
  }
  if (/error|fail|fix/.test(message)) {
    return 'REPLY\n  ANSWER "The echo step failed with an error; patch the echo step input to recover."\n  CITATION step echo "Failed echo step in run context."'
  }
  return 'REPLY\n  ANSWER "I am the ECP assistant. Ask about workflows, ECP, or available capabilities."'
}

/**
 * Deterministic generate handler for `@executioncontrolprotocol/test.generate`.
 * @category Testing
 */
export function testModelGenerateHandler(input: TestModelGenerateInput): { text: string } {
  const prompt = input.prompt ?? ""
  const system = input.system ?? ""
  if (/intent router/i.test(system)) {
    return { text: testIntentResponse(prompt) }
  }
  if (/ECP assistant|harness\.reply|REPLY block/i.test(system)) {
    return { text: testAssistantResponse(prompt) }
  }
  if (prompt.includes("User message:")) {
    return { text: testIntentResponse(prompt) }
  }
  if (prompt.includes("@executioncontrolprotocol.patch") || /PATCH\s+WORKFLOW/i.test(prompt)) {
    return {
      text: [
        "PATCH WORKFLOW echo-test",
        "UPDATE STEP echo",
        '  WITH value = "patched"',
      ].join("\n"),
    }
  }
  return {
    text: [
      'WORKFLOW demo-generated "Demo generated"',
      "STEP echo USES @executioncontrolprotocol/test.echo",
      '  LABEL "Demo Echo"',
      '  WITH value = "hello"',
      "  AS echo",
    ].join("\n"),
  }
}
