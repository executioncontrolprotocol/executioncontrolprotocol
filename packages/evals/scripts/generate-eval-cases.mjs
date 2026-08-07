import { writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/cases")
const matrixExt = ["@executioncontrolprotocol/format-toon", "@executioncontrolprotocol/format-eql", "@executioncontrolprotocol/format-json", "@executioncontrolprotocol/test"]
const offTopicJudge = {
  enabled: true,
  goal: "Politely declines off-topic request and redirects to ECP/workflow topics",
  rubric: "Brief polite decline mentioning workflows, ECP, or capabilities",
  requireApproved: true,
}
const baseDet = [
  { kind: "invokeSuccess" },
  { kind: "artifactSchema", value: "@executioncontrolprotocol.workflow" },
  { kind: "validationValid" },
  { kind: "descriptorListsExtensions", ids: matrixExt },
]

function writeSuite(name, cases) {
  writeFileSync(path.join(root, `${name}.cases.json`), JSON.stringify({ cases }, null, 2) + "\n")
}

const creates = [
  ["wf-create-01", "Minimal echo", "Create a minimal @executioncontrolprotocol.workflow with one step id echo using @executioncontrolprotocol/test.echo and input value hello.", [{ kind: "stepUses", capabilityId: "@executioncontrolprotocol/test.echo" }, { kind: "stepCount", exact: 1 }]],
  ["wf-create-02", "Echo plus summarize", "Create a workflow with echo (@executioncontrolprotocol/test.echo) then summarize (@executioncontrolprotocol/test.summarize) passing echo output.", [{ kind: "stepCount", min: 2 }, { kind: "stepUses", capabilityId: "@executioncontrolprotocol/test.summarize" }]],
  ["wf-create-03", "Validate then echo", "Build a workflow: first @executioncontrolprotocol/test.validate then @executioncontrolprotocol/test.echo.", [{ kind: "stepUses", capabilityId: "@executioncontrolprotocol/test.validate" }]],
  ["wf-create-04", "Notify step", "Create workflow with @executioncontrolprotocol/test.echo and a final @executioncontrolprotocol/test.notify step.", [{ kind: "stepUses", capabilityId: "@executioncontrolprotocol/test.notify" }]],
  ["wf-create-05", "Translate branch", "Create a two-step workflow using @executioncontrolprotocol/test.echo and @executioncontrolprotocol/test.translate.", [{ kind: "stepUses", capabilityId: "@executioncontrolprotocol/test.translate" }]],
  ["wf-create-06", "Spanish label", "Crea un flujo con un paso echo usando @executioncontrolprotocol/test.echo.", [{ kind: "stepUses", capabilityId: "@executioncontrolprotocol/test.echo" }]],
  ["wf-create-07", "French label", "Créez un workflow avec une étape @executioncontrolprotocol/test.echo.", [{ kind: "stepUses", capabilityId: "@executioncontrolprotocol/test.echo" }]],
  ["wf-create-08", "German label", "Erstelle einen Workflow mit @executioncontrolprotocol/test.echo.", [{ kind: "stepUses", capabilityId: "@executioncontrolprotocol/test.echo" }]],
  ["wf-create-09", "Triple steps", "Create a 3-step workflow using @executioncontrolprotocol/test.validate, @executioncontrolprotocol/test.echo, and @executioncontrolprotocol/test.summarize.", [{ kind: "stepCount", min: 3 }]],
  ["wf-create-10", "Workflow id minimal-echo", "Create workflow id minimal-echo with one @executioncontrolprotocol/test.echo step labeled Runner.", [{ kind: "stepUses", capabilityId: "@executioncontrolprotocol/test.echo" }]],
  ["wf-create-11", "Quality judge", "Design a clear production workflow using @executioncontrolprotocol/test.echo for ingestion.", [], { enabled: true, goal: "Workflow is coherent and references echo capability", requireApproved: true }],
  ["wf-create-12", "Descriptor caps", "List capabilities then create echo-only workflow with @executioncontrolprotocol/test.echo.", [{ kind: "descriptorListsCapabilities", ids: ["@executioncontrolprotocol/test.echo", "@executioncontrolprotocol/test.summarize"] }]],
].map(([id, title, request, extra, judge]) => ({
  id,
  suite: "workflow-create",
  title,
  harness: "workflow-authoring",
  model: "default",
  input: { request },
  assertions: { deterministic: [...baseDet, ...extra], judge: judge ?? { enabled: false } },
}))

const patches = [
  ["wf-patch-01", "Label change", "Change the echo step label to Patched Echo.", "workflows/echo-workflow.json", [{ kind: "stepLabel", stepId: "echo", value: "Patched Echo" }]],
  ["wf-patch-02", "Input value", "Set echo input value to world.", "workflows/echo-workflow.json", []],
  ["wf-patch-03", "Add summarize", "Add a summarize step after echo using @executioncontrolprotocol/test.summarize.", "workflows/echo-workflow.json", [{ kind: "stepCount", min: 2 }]],
  ["wf-patch-04", "Remove notify", "Remove the notify step from the workflow.", "workflows/multi-cap-workflow.json", [{ kind: "stepRemoved", stepId: "notify" }]],
  ["wf-patch-05", "Workflow label", "Change workflow label to Updated Chain.", "workflows/two-step-chain.json", [{ kind: "workflowLabel", value: "Updated Chain" }]],
  ["wf-patch-06", "Step config", "Change summarize step label to Short Summary.", "workflows/two-step-chain.json", [{ kind: "stepLabel", stepId: "summarize", value: "Short Summary" }]],
  ["wf-patch-07", "Ref chain", "Ensure summarize input references echo output via $ref.", "workflows/two-step-chain.json", [{ kind: "inputRefPresent", stepId: "summarize" }]],
  ["wf-patch-08", "Add validate", "Insert a validate step before echo using @executioncontrolprotocol/test.validate.", "workflows/echo-workflow.json", [{ kind: "stepUses", capabilityId: "@executioncontrolprotocol/test.validate" }]],
  ["wf-patch-09", "Combined", "Add translate after echo and remove summarize if present.", "workflows/two-step-chain.json", []],
  ["wf-patch-10", "Patch judge", "Improve echo label to be user friendly.", "workflows/echo-workflow.json", [], { enabled: true, goal: "Patch is minimal and correct", requireApproved: true }],
  ["wf-patch-11", "Translate label", "Rename echo label to Translated Output.", "workflows/echo-workflow.json", []],
  ["wf-patch-12", "Move echo", "Move the echo step to run after validate.", "workflows/echo-validate-reorder.json", [{ kind: "stepOrder", stepIds: ["validate", "echo"] }]],
].map(([id, title, request, baseline, extra, judge]) => ({
  id,
  suite: "workflow-patch",
  title,
  harness: "workflow-authoring",
  model: "default",
  baselineWorkflow: baseline,
  input: { request },
  assertions: {
    deterministic: [
      { kind: "invokeSuccess" },
      { kind: "artifactSchema", value: "@executioncontrolprotocol.workflow" },
      { kind: "validationValid" },
      ...extra,
    ],
    judge: judge ?? { enabled: false },
  },
}))

const intents = [
  ["intent-01", "Salutation", "Hello there!", "general", false],
  ["intent-02", "FAQ", "What is ECP?", "faq", false],
  ["intent-03", "Create", "Create a new workflow that sends a summary email.", "workflow-create", true],
  ["intent-04", "Patch", "Update the echo step to use value world.", "workflow-patch", false],
  ["intent-05", "Capabilities", "What extensions are available in this environment?", "general", true],
  ["intent-06", "Error symptom", "My workflow failed on the echo step with an error.", "workflow-patch", true],
  ["intent-07", "Bonjour", "Bonjour!", "general", false],
  ["intent-08", "Hola create", "Crea un flujo nuevo con echo.", "workflow-create", true],
  ["intent-09", "General chat", "Tell me a joke.", "general", true],
  ["intent-10", "Patch config", "Change the workflow step configuration for summarize.", "workflow-patch", false],
  ["intent-11", "FAQ how", "How does workflow patching work?", "faq", true],
  ["intent-12", "Build", "Build a pipeline with echo and notify.", "workflow-create", true],
  ["intent-13", "Identity", "What can you do?", "general", true],
  ["intent-14", "Off-topic recipe", "Best pizza recipe?", "general", true],
  ["intent-15", "FAQ patch how-to", "How does step patching work in ECP?", "faq", true],
  ["intent-16", "Label patch", "Change the echo step label to Greeting.", "workflow-patch", false],
  ["intent-17", "Off-topic weather", "What's the weather today?", "general", true],
].map(([id, title, message, intent, judge]) => ({
  id,
  suite: "intent",
  title,
  harness: "intent-classification",
  model: "default",
  input: { message },
  assertions: {
    deterministic: [
      { kind: "invokeSuccess" },
      { kind: "intent", value: intent },
      { kind: "descriptorListsExtensions", ids: matrixExt },
    ],
    judge: judge
      ? { enabled: true, goal: `Intent should be ${intent}`, requireApproved: true }
      : { enabled: false },
  },
}))

const assistants = [
  ["asst-01", "Failed echo", "Why did step echo fail?", "runs/failed-echo-step.json", [{ kind: "answerContains", text: "echo" }, { kind: "answerContains", text: "error" }], { enabled: true, goal: "Explains echo failure", rubric: "Mentions echo step and describes the error from run context", requireApproved: true }],
  ["asst-02", "Failed status", "What is the run status?", "runs/failed-echo-step.json", [{ kind: "answerContains", text: "fail" }], false],
  ["asst-03", "Running", "Is my workflow still running?", "runs/running-pending.json", [{ kind: "answerContains", text: "run" }], false],
  ["asst-04", "Extensions", "What plugins and extensions can you use?", null, [{ kind: "answerContains", text: "ecp" }], { enabled: true, goal: "Extensions", rubric: "Lists ECP extensions or plugins loaded in this environment", requireApproved: true }],
  ["asst-05", "Steps", "What steps are in the workflow?", "runs/failed-echo-step.json", [], false],
  ["asst-06", "Fix suggest", "How can I fix the echo error?", "runs/failed-echo-step.json", [{ kind: "citationStepId", value: "echo" }], true],
  ["asst-07", "Output", "What did the echo step produce?", "runs/completed-with-refs.json", [], false],
  ["asst-08", "Tone judge", "Explain the failure politely.", "runs/failed-echo-step.json", [{ kind: "answerContains", text: "error" }], { enabled: true, goal: "Professional helpful tone", rubric: "Polite explanation of the echo error with actionable guidance", requireApproved: true }],
  ["asst-09", "Confirm patch", "Should we patch step echo input?", "runs/failed-echo-step.json", [], { enabled: true, goal: "Confirm patch", rubric: "Affirms patching echo step input when appropriate", requireApproved: true }],
  ["asst-10", "Capabilities list", "List supported step capabilities.", null, [{ kind: "answerContains", text: "test.echo" }], { enabled: true, goal: "Capabilities list", rubric: "Names concrete step capability ids such as test.echo", requireApproved: true }],
  ["asst-11", "What is ECP", "What is ECP?", null, [{ kind: "answerContains", text: "ECP" }], { enabled: true, goal: "Defines ECP in one or two sentences", rubric: "Mentions workflows or governed environments", requireApproved: true }],
  ["asst-12", "Identity", "What can you do?", null, [{ kind: "answerContains", text: "workflow" }], { enabled: true, goal: "States assistant capabilities", rubric: "Mentions building workflows and answering ECP or environment questions", requireApproved: true }],
  ["asst-13", "Register refusal", "Register a new extension for me.", null, [{ kind: "answerContains", text: "cannot" }], { enabled: true, goal: "Graceful refusal", rubric: "Explains cannot register and offers alternatives", requireApproved: true }],
  ["asst-14", "Environment help", "What capabilities are available?", null, [{ kind: "answerContains", text: "test.echo" }], { enabled: true, goal: "Lists capabilities", rubric: "Names capability ids from the environment", requireApproved: true }],
  ["asst-15", "Off-topic joke", "Tell me a joke.", null, [{ kind: "answerRedirectsToScope" }], offTopicJudge],
  ["asst-16", "Off-topic weather", "What's the weather today?", null, [{ kind: "answerRedirectsToScope" }], offTopicJudge],
  ["asst-17", "Off-topic cover letter", "Write a cover letter for a software job.", null, [{ kind: "answerRedirectsToScope" }, { kind: "answerMaxLength", max: 220 }], offTopicJudge],
  ["asst-18", "Gibberish", "asdf qwerty ???", null, [{ kind: "answerRedirectsToScope" }], offTopicJudge],
  ["asst-19", "MCP vs ECP", "How is MCP different from ECP?", null, [{ kind: "answerContains", text: "ECP" }], { enabled: true, goal: "Contrasts MCP and ECP", rubric: "Mentions both MCP and ECP in a brief accurate way", requireApproved: true }],
  ["asst-20", "Workflow definition", "What is a workflow in ECP?", null, [{ kind: "answerContains", text: "workflow" }], { enabled: true, goal: "Defines ECP workflow", rubric: "Mentions steps, capabilities, or portable manifests", requireApproved: true }],
  ["asst-21", "Off-topic task", "Write my resume.", null, [{ kind: "answerRedirectsToScope" }], offTopicJudge],
  ["asst-22", "FAQ brevity", "What is ECP?", null, [{ kind: "answerContains", text: "ECP" }, { kind: "answerMaxLength", max: 280 }, { kind: "rawNotContains", text: "```" }], { enabled: true, goal: "Defines ECP briefly", rubric: "One or two sentences, no markdown fences", requireApproved: true }],
].map(([id, title, message, runFixture, extra, judge]) => ({
  id,
  suite: "assistant",
  title,
  harness: "workflow-assistant",
  model: "default",
  input: {
    message,
    ...(runFixture ? { runContextFixture: runFixture } : {}),
  },
  assertions: {
    deterministic: [
      { kind: "invokeSuccess" },
      { kind: "replySchema" },
      ...extra,
    ],
    judge: typeof judge === "object" ? judge : judge ? { enabled: true, goal: title, requireApproved: true } : { enabled: false },
  },
}))

const flows = [
  {
    id: "flow-01",
    suite: "flow",
    title: "Troubleshoot then patch",
    model: "default",
    steps: [
      {
        harness: "intent-classification",
        input: { message: "The workflow failed on echo, help me fix it." },
        assertions: { deterministic: [{ kind: "intent", value: "workflow-patch" }], judge: { enabled: false } },
      },
      {
        harness: "workflow-authoring",
        input: {
          request: "Set echo input value to recovered.",
          manifestRef: "workflows/echo-workflow.json",
        },
        assertions: { deterministic: [{ kind: "validationValid" }], judge: { enabled: false } },
      },
      {
        harness: "workflow-assistant",
        input: {
          message: "Confirm the fix applies to step echo?",
          runContextFixture: "runs/failed-echo-step.json",
        },
        assertions: {
          deterministic: [{ kind: "replySchema" }],
          judge: { enabled: true, goal: "Confirms echo step", requireApproved: true },
        },
      },
    ],
  },
  {
    id: "flow-02",
    suite: "flow",
    title: "Create routing",
    model: "default",
    steps: [
      {
        harness: "intent-classification",
        input: { message: "I need a new workflow with echo and summarize." },
        assertions: { deterministic: [{ kind: "intent", value: "workflow-create" }], judge: { enabled: false } },
      },
      {
        harness: "workflow-authoring",
        input: {
          request: "Create echo then @executioncontrolprotocol/test.summarize workflow.",
        },
        assertions: { deterministic: [{ kind: "artifactSchema", value: "@executioncontrolprotocol.workflow" }], judge: { enabled: false } },
      },
    ],
  },
  {
    id: "flow-03",
    suite: "flow",
    title: "FAQ then general",
    model: "default",
    steps: [
      {
        harness: "intent-classification",
        input: { message: "How does patching work?" },
        assertions: { deterministic: [{ kind: "intent", value: "faq" }], judge: { enabled: false } },
      },
      {
        harness: "workflow-assistant",
        input: { message: "How does patching work?" },
        assertions: {
          deterministic: [{ kind: "replySchema" }, { kind: "answerContains", text: "patch" }],
          judge: { enabled: true, goal: "Explains patching", rubric: "Accurate ECP patching overview", requireApproved: true },
        },
      },
      {
        harness: "intent-classification",
        input: { message: "Thanks!" },
        assertions: { deterministic: [{ kind: "intent", value: "general" }], judge: { enabled: false } },
      },
      {
        harness: "workflow-assistant",
        input: { message: "Thanks!" },
        assertions: {
          deterministic: [{ kind: "replySchema" }],
          judge: { enabled: true, goal: "Polite acknowledgment", rubric: "Brief friendly reply", requireApproved: true },
        },
      },
    ],
  },
  {
    id: "flow-04",
    suite: "flow",
    title: "Patch chain refs",
    model: "default",
    steps: [
      {
        harness: "workflow-authoring",
        input: {
          request: "Ensure summarize uses $ref to echo output.",
          manifestRef: "workflows/two-step-chain.json",
        },
        assertions: { deterministic: [{ kind: "inputRefPresent", stepId: "summarize" }], judge: { enabled: false } },
      },
      {
        harness: "workflow-assistant",
        input: {
          message: "Did the chain run complete?",
          runContextFixture: "runs/completed-with-refs.json",
        },
        assertions: { deterministic: [{ kind: "replySchema" }], judge: { enabled: true, goal: "Mentions completed run", requireApproved: true } },
      },
    ],
  },
  {
    id: "flow-05",
    suite: "flow",
    title: "Salutation to create",
    model: "default",
    steps: [
      {
        harness: "intent-classification",
        input: { message: "Hi!" },
        assertions: { deterministic: [{ kind: "intent", value: "general" }], judge: { enabled: false } },
      },
      {
        harness: "intent-classification",
        input: { message: "Actually create an echo workflow." },
        assertions: { deterministic: [{ kind: "intent", value: "workflow-create" }], judge: { enabled: false } },
      },
      {
        harness: "workflow-authoring",
        input: { request: "Create minimal @executioncontrolprotocol/test.echo workflow." },
        assertions: { deterministic: [{ kind: "stepUses", capabilityId: "@executioncontrolprotocol/test.echo" }], judge: { enabled: false } },
      },
    ],
  },
  {
    id: "flow-06",
    suite: "flow",
    title: "Error explain and patch",
    model: "default",
    steps: [
      {
        harness: "workflow-assistant",
        input: {
          message: "What error occurred?",
          runContextFixture: "runs/failed-echo-step.json",
        },
        assertions: {
          deterministic: [{ kind: "answerContains", text: "error" }],
          judge: { enabled: true, goal: "Describes echo failure", rubric: "Mentions echo and the error from the run context", requireApproved: true },
        },
      },
      {
        harness: "workflow-authoring",
        input: {
          request: "Fix echo input to hello.",
          manifestRef: "workflows/echo-workflow.json",
        },
        assertions: { deterministic: [{ kind: "validationValid" }], judge: { enabled: false } },
      },
      {
        harness: "workflow-assistant",
        input: {
          message: "Where should the fix be applied?",
          runContextFixture: "runs/failed-echo-step.json",
        },
        assertions: {
          deterministic: [{ kind: "citationStepId", value: "echo" }],
          judge: { enabled: true, goal: "Points to echo step", rubric: "Identifies step echo as where to apply the fix", requireApproved: true },
        },
      },
    ],
  },
  {
    id: "flow-07",
    suite: "flow",
    title: "FAQ what is ECP routing",
    model: "default",
    steps: [
      {
        harness: "intent-classification",
        input: { message: "What is ECP?" },
        assertions: { deterministic: [{ kind: "intent", value: "faq" }], judge: { enabled: false } },
      },
      {
        harness: "workflow-assistant",
        input: { message: "What is ECP?" },
        assertions: {
          deterministic: [{ kind: "replySchema" }, { kind: "answerContains", text: "ECP" }],
          judge: { enabled: true, goal: "Defines ECP", rubric: "Mentions workflows or governed environments", requireApproved: true },
        },
      },
    ],
  },
  {
    id: "flow-08",
    suite: "flow",
    title: "Identity routing",
    model: "default",
    steps: [
      {
        harness: "intent-classification",
        input: { message: "What can you do?" },
        assertions: { deterministic: [{ kind: "intent", value: "general" }], judge: { enabled: false } },
      },
      {
        harness: "workflow-assistant",
        input: { message: "What can you do?" },
        assertions: {
          deterministic: [{ kind: "replySchema" }, { kind: "answerContains", text: "workflow" }],
          judge: { enabled: true, goal: "States assistant capabilities", rubric: "Mentions building workflows and answering ECP questions", requireApproved: true },
        },
      },
    ],
  },
  {
    id: "flow-09",
    suite: "flow",
    title: "Off-topic joke routing",
    model: "default",
    steps: [
      {
        harness: "intent-classification",
        input: { message: "Tell me a joke." },
        assertions: { deterministic: [{ kind: "intent", value: "general" }], judge: { enabled: false } },
      },
      {
        harness: "workflow-assistant",
        input: { message: "Tell me a joke." },
        assertions: {
          deterministic: [{ kind: "replySchema" }, { kind: "answerRedirectsToScope" }],
          judge: offTopicJudge,
        },
      },
    ],
  },
]

const chatCases = [
  {
    id: "chat-01",
    suite: "chat",
    title: "Troubleshoot failure routes to patch",
    harness: "chat",
    model: "default",
    input: {
      message: "The workflow failed on echo, help me fix it.",
      manifestRef: "workflows/echo-workflow.json",
    },
    assertions: {
      deterministic: [
        { kind: "invokeSuccess" },
        { kind: "classifiedIntent", value: "workflow-patch" },
        { kind: "shotCount", value: 2 },
        { kind: "promptPhase", shotIndex: 0, value: "unfiltered" },
        { kind: "promptPhase", shotIndex: 1, value: "contextualized" },
        { kind: "validationValid" },
      ],
      judge: { enabled: false },
    },
  },
  {
    id: "chat-02",
    suite: "chat",
    title: "Create routing",
    harness: "chat",
    model: "default",
    input: { message: "I need a new workflow with echo and summarize." },
    assertions: {
      deterministic: [
        { kind: "invokeSuccess" },
        { kind: "classifiedIntent", value: "workflow-create" },
        { kind: "shotCount", value: 2 },
        { kind: "artifactSchema", value: "@executioncontrolprotocol.workflow" },
      ],
      judge: { enabled: false },
    },
  },
  {
    id: "chat-03",
    suite: "chat",
    title: "FAQ how patching works",
    harness: "chat",
    model: "default",
    input: { message: "How does workflow patching work?" },
    assertions: {
      deterministic: [
        { kind: "invokeSuccess" },
        { kind: "classifiedIntent", value: "faq" },
        { kind: "classifiedTopic", contains: "patch" },
        { kind: "shotCount", value: 2 },
        { kind: "replySchema" },
      ],
      judge: {
        enabled: true,
        goal: "Explains ECP patching without changing a workflow",
        classifiedIntent: "faq",
        requireApproved: true,
      },
    },
  },
  {
    id: "chat-04",
    suite: "chat",
    title: "What is ECP",
    harness: "chat",
    model: "default",
    input: { message: "What is ECP?" },
    assertions: {
      deterministic: [
        { kind: "invokeSuccess" },
        { kind: "classifiedIntent", value: "faq" },
        { kind: "replySchema" },
        { kind: "answerContains", text: "ECP" },
      ],
      judge: {
        enabled: true,
        goal: "Defines ECP briefly",
        classifiedIntent: "faq",
        rubric: "One or two sentences, no markdown fences",
        requireApproved: true,
      },
    },
  },
  {
    id: "chat-05",
    suite: "chat",
    title: "Capabilities question",
    harness: "chat",
    model: "default",
    input: { message: "What extensions are available in this environment?" },
    assertions: {
      deterministic: [
        { kind: "invokeSuccess" },
        { kind: "classifiedIntent", value: "general" },
        { kind: "replySchema" },
        { kind: "answerContains", text: "ecp" },
      ],
      judge: {
        enabled: true,
        goal: "Lists ECP extensions",
        classifiedIntent: "general",
        requireApproved: true,
      },
    },
  },
  {
    id: "chat-06",
    suite: "chat",
    title: "Patch label change",
    harness: "chat",
    model: "default",
    input: {
      message: "Change the echo step label to Patched Echo.",
      manifestRef: "workflows/echo-workflow.json",
    },
    assertions: {
      deterministic: [
        { kind: "invokeSuccess" },
        { kind: "classifiedIntent", value: "workflow-patch" },
        { kind: "validationValid" },
      ],
      judge: { enabled: false },
    },
  },
  {
    id: "chat-07",
    suite: "chat",
    title: "Identity question",
    harness: "chat",
    model: "default",
    input: { message: "What can you do?" },
    assertions: {
      deterministic: [
        { kind: "invokeSuccess" },
        { kind: "classifiedIntent", value: "general" },
        { kind: "replySchema" },
        { kind: "answerContains", text: "workflow" },
      ],
      judge: {
        enabled: true,
        goal: "States assistant capabilities",
        classifiedIntent: "general",
        requireApproved: true,
      },
    },
  },
  {
    id: "chat-08",
    suite: "chat",
    title: "Off-topic joke",
    harness: "chat",
    model: "default",
    input: { message: "Tell me a joke." },
    assertions: {
      deterministic: [
        { kind: "invokeSuccess" },
        { kind: "classifiedIntent", value: "general" },
        { kind: "classifiedTopic", contains: "off-topic" },
        { kind: "replySchema" },
        { kind: "answerRedirectsToScope" },
      ],
      judge: { ...offTopicJudge, classifiedIntent: "general" },
    },
  },
  {
    id: "chat-09",
    suite: "chat",
    title: "Run status assistant",
    harness: "chat",
    model: "default",
    input: {
      message: "What is the run status?",
      runContextFixture: "runs/failed-echo-step.json",
    },
    assertions: {
      deterministic: [
        { kind: "invokeSuccess" },
        { kind: "shotCount", value: 2 },
        { kind: "replySchema" },
        { kind: "answerContains", text: "fail" },
      ],
      judge: {
        enabled: true,
        goal: "Reports failed run status",
        rubric: "Mentions failed status from run context",
        requireApproved: true,
      },
    },
  },
]

writeSuite("workflow-create", creates)
writeSuite("workflow-patch", patches)
writeSuite("intent", intents)
writeSuite("assistant", assistants)
writeSuite("flow", flows)
writeSuite("chat", chatCases)
console.log(
  "Wrote",
  creates.length + patches.length + intents.length + assistants.length + flows.length + chatCases.length,
  "cases"
)
