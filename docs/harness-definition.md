# Harness definitions (design + implementation)

Implemented in `@executioncontrolprotocol/core` (framework only):

- Harness framework: `defineHarness`, `catalogHarness`, `executeHarnessInvoke`, `runModelRepairLoop`
- Operation feedback: `collectDecodeFeedback`, `collectPatchFeedback`, `collectValidationFeedback` (`HarnessOperationFeedback` in `@executioncontrolprotocol/types`)
- Provider capability: `@executioncontrolprotocol/<provider>.generate` (`@executioncontrolprotocol/model.generate` contract)
- Core formatters: `@executioncontrolprotocol/format-json`, `@executioncontrolprotocol/format-fluent` (cataloged from core, not workspace extension packages)
- Environment: `harness(id).uses(provider.generate).with(config)` via `withHarnesses([...])`
- Invoke: `ecp.invoke(harnessId.evaluate).uses(override?).with(input)`

Product harnesses (prompts, eval-specific normalization) live outside core:

| Harness id | Package | Role |
| ---------- | ------- | ---- |
| `@executioncontrolprotocol/harness-browser-nano` | `@executioncontrolprotocol/harnesses-browser-nano` | Browser demo + Ollama/matrix evals (routes by input `task`) |

See [harness-eval.md](harness-eval.md) for local Ollama evaluation.

## Prompt and schema fixtures

**Core** owns protocol schema examples and prompt assembly (`buildSystemPromptFromFixture`, `buildRepairHintFromFixture`). **Harness packages** own product prompt JSON and eval corpora.

| Tier | Location | Contents |
| ---- | -------- | -------- |
| Schema examples | `packages/core/fixtures/schema-examples/` | Valid JSON/EQL literals per output schema (`@executioncontrolprotocol.intent`, `@executioncontrolprotocol.workflow`, …) |
| Harness prompts | `packages/harnesses/*/fixtures/harness-prompts/*.prompt.json` | Role, task, intent definitions, few-shots, repair hints (per harness) |
| Eval cases | `packages/harnesses/*/fixtures/eval-cases/*.cases.json` | Inputs and assertions only (no system prompt text) |

API: `buildSystemPromptFromFixture(fixture)`, `buildRepairHintFromFixture(fixture)`, `loadSchemaExample(outputSchema)` from `@executioncontrolprotocol/core`. Harness handlers load local fixtures and pass them to the core builders.

**Handler internals:** compact descriptor/workflow/run summaries, repair presentation, and JSON normalization for small models are exported from `@executioncontrolprotocol/core` (`summarizeEnvironmentDescriptor`, `formatStructuredRepairForModel`, `normalizeWorkflowDocumentCandidate`, etc.). Product-specific heuristics (e.g. capability hints) stay in harness packages such as `@executioncontrolprotocol/harnesses-browser-nano`.

**Identity:** optional `identity: true` on harness prompt fixtures prepends `ECP_ASSISTANT_IDENTITY_PRIMER` via `buildSystemPrompt`. The unified `workflow-assistant` task answers ECP FAQ, identity, environment help, and run-aware Q&A.

**Task input contracts:** shared Zod shapes in `@executioncontrolprotocol/types` (`harnessIntentClassificationInputSchema`, `harnessWorkflowAuthoringInputSchema`, `harnessWorkflowAssistantInputSchema`).

## Harness operation feedback (core contract)

Core runtime operations return structured envelopes (`DecodeResult`, `PatchResult`, `ValidationResult`). Harnesses must not rely on bare Zod messages like `Required` without paths.

Use collectors in `@executioncontrolprotocol/core` to build `HarnessOperationFeedback`:

| Collector | Source | `stage` |
| --------- | ------ | ------- |
| `collectDecodeFeedback` | `ecp.decode().process()` | `decode` |
| `collectPatchFeedback` | `ecp.patch().process()` | `patch-apply` |
| `collectValidationFeedback` | `ecp.validate()` | `validate` |

Each feedback record includes `issues: ValidationIssue[]` (path, code, message, optional `suggestions`), optional `targetSchema`, and for patch apply, `applied` entries.

**Harness responsibility:** turn `HarnessOperationFeedback[]` into model instructions (system prompt, repair lines, examples). Core does not format repair prompts.

**Optional loop:** `runModelRepairLoop({ maxAttempts, generate, evaluate })` orchestrates retries; harness supplies `generate` and `evaluate` callbacks. Trace may include `repairAttempts` when enabled in harness config.

---

## Typed handlers (Zod-inferred generics)

`defineHarness` propagates TypeScript types from Zod schemas into `withHandler`:

| Builder method | Inferred type |
| -------------- | ------------- |
| `withConfig(schema)` | `ctx.config` is `z.infer<typeof schema>` |
| `withInput(schema)` | handler `input` is `z.infer<typeof schema>` |
| `withOutput(schema)` | handler return type is `z.infer<typeof schema>` |

```ts
import { defineHarness } from "@executioncontrolprotocol/core"
import type { HarnessConfigOf, HarnessInputOf } from "@executioncontrolprotocol/core"
import { z } from "zod"

const harnessConfigSchema = z.object({ system: z.string() })
const harnessInputSchema = z.object({ message: z.string(), model: z.string().optional() })

export type MyHarnessInput = HarnessInputOf<typeof harnessInputSchema>
export type MyHarnessConfig = HarnessConfigOf<typeof harnessConfigSchema>

import { harnessEvaluateOutputSchema } from "@executioncontrolprotocol/types"

export const myHarness = defineHarness("@acme", "assistant")
  .withConfig(harnessConfigSchema)
  .withInput(harnessInputSchema)
  .withOutput(harnessEvaluateOutputSchema)
  .usesProviderInterface(ECP_MODEL_GENERATE_INTERFACE)
  .withHandler(async (input, ctx) => {
    // input.message and ctx.config.system are typed; no manual .parse() required
    ...
  })
  .build()
```

**Runtime validation:** `executeHarnessInvoke` still `safeParse`s invoke input against `inputSchema` before calling the handler. `createHarnessCapabilityContext` parses environment binding config with `configSchema` when the harness defines one.

**Catalog boundary:** `HarnessDefinition` in the catalog stores an erased handler (`unknown` input/output). `ecp.invoke(...).with(payload)` remains `unknown` at the call site unless you export `HarnessInputOf<typeof harnessInputSchema>` for tests or add a typed invoke helper.

---

We simplify the harness output contract to use a single **`format`** reference, not both `format` and `decode`.

## 1. Use `format` as the encoder/decoder extension ID

Instead of:

```ts
output: {
  schema: "@executioncontrolprotocol.workflow",
  format: "@executioncontrolprotocol/format-toon",
  decode: "@executioncontrolprotocol/format-toon.decode",
  validate: true,
}
```

Use:

```ts
output: {
  schema: "@executioncontrolprotocol.workflow",
  format: "@executioncontrolprotocol/format-toon",
  validate: true,
}
```

Then the harness runtime knows:

```ts
ctx.decode(raw)
  .uses(config.output.format)
  .to(config.output.schema)
```

That keeps it consistent with the existing encode/decode grammar, where the formatter extension is selected via `.uses("@executioncontrolprotocol/format-toon")`. The browser demo already uses this pattern for TOON and Mermaid panel generation, with the canonical workflow manifest feeding independent encoders.

So the rule becomes:

> `output.format` points to a registered formatter extension. The harness uses that formatter for decoding model output into the expected `output.schema`.

For patching:

```ts
output: {
  schema: "@executioncontrolprotocol.patch",
  format: "@executioncontrolprotocol/format-toon",
  apply: "ecp.patch",
  validateResult: true,
}
```

For JSON intent classification:

```ts
output: {
  schema: "@executioncontrolprotocol.intent",
  format: "@executioncontrolprotocol/format-json",
  validate: true,
}
```

Or if JSON is built in:

```ts
output: {
  schema: "@executioncontrolprotocol.intent",
  format: "json",
  validate: true,
}
```

But I would probably prefer even JSON to be modeled as a formatter eventually:

```ts
format: "@executioncontrolprotocol/format-json"
```

That keeps the contract uniform.

---

## 2. Harness binding should validate dependencies after the full environment is assembled

You’re exactly right on timing.

This should **not** be order-sensitive:

```ts
environment("browser-demo-app")
  .withHarnesses([
    harness("@executioncontrolprotocol/workflow-authoring")
      .uses("@executioncontrolprotocol/ollama.generate")
      .with({
        output: {
          schema: "@executioncontrolprotocol.workflow",
          format: "@executioncontrolprotocol/format-toon",
          validate: true,
        },
      }),
  ])
  .withExtensions([
    extension("@executioncontrolprotocol/ollama").with({ model: "gemma3:4b" }),
    extension("@executioncontrolprotocol/format-toon").with({}),
  ]);
```

Even if the harness is declared before extensions, validation should wait until the environment compile/finalize phase.

ECP already treats the environment as the configured execution container, while workflows remain portable and environment-free.  Harness validation should follow the same model: collect all bindings first, then resolve IDs.

## Proposed lifecycle

```txt
environment builder phase
  collect runtime binding
  collect extension bindings
  collect policy bindings
  collect harness bindings

environment compile/finalize phase
  register/resolve runtime
  register/resolve extensions
  register/resolve policies
  register/resolve harnesses
  validate harness dependencies
  freeze registry if browser policy requires it

environment invocation phase
  ecp.invoke("@executioncontrolprotocol/workflow-authoring")
```

So harness dependency checks should happen during:

```ts
env.compile()
env.validate()
env.describe()
env.invoke(...)
```

But not during:

```ts
harness(...).uses(...).with(...)
```

The builder should only record intent.

---

## 3. Harness dependency validation

When the environment finalizes, each harness binding should validate:

| Dependency         | Check                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------- |
| Harness ID         | Registered harness definition exists                                                        |
| `.uses(...)`       | Capability exists in the bound environment                                                  |
| Provider interface | Capability satisfies expected interface, such as `@executioncontrolprotocol/model.generate` |
| `output.format`    | Formatter extension exists                                                                  |
| `output.schema`    | Known schema or schema resolver exists                                                      |
| Policies           | Active policies allow provider and formatter use                                            |
| Runtime support    | Runtime supports direct invoke/harness invocation                                           |

Example validation errors:

```json
{
  "code": "UNKNOWN_HARNESS",
  "message": "Harness @executioncontrolprotocol/workflow-authoring is not registered.",
  "path": "harnesses[0].id"
}
```

```json
{
  "code": "UNKNOWN_HARNESS_PROVIDER",
  "message": "Harness @executioncontrolprotocol/workflow-authoring uses @executioncontrolprotocol/ollama.generate, but @executioncontrolprotocol/ollama is not bound in this environment.",
  "path": "harnesses[0].uses",
  "suggestions": ["Bind extension(\"@executioncontrolprotocol/ollama\").with({...})"]
}
```

```json
{
  "code": "UNKNOWN_OUTPUT_FORMAT",
  "message": "Harness @executioncontrolprotocol/workflow-authoring references output format @executioncontrolprotocol/format-toon, but that formatter is not available.",
  "path": "harnesses[0].config.output.format",
  "suggestions": ["Bind extension(\"@executioncontrolprotocol/format-toon\").with({})"]
}
```

The implementation report already shows `Environment.validate(workflow?)` exists and the runtime has registry resolution, validation, descriptor generation, and capability lookup.  Harness validation should extend that same mechanism.

---

## 4. Revised environment example

```ts
export const localHarnessEnvironment = environment(
  "local-authoring-test",
  "Local Authoring Test"
)
  .withRuntime(
    runtime("@executioncontrolprotocol/local", "Local Runtime").with({})
  )

  .withExtensions([
    extension("@executioncontrolprotocol/ollama", "Ollama").with({
      baseUrl: "http://localhost:11434",
      model: "gemma3:4b",
      temperature: 0.1,
      maxTokens: 4096,
    }),

    extension("@executioncontrolprotocol/format-toon", "TOON Formatter").with({}),

    extension("@executioncontrolprotocol/test", "Test Capabilities").with({}),
  ])

  .withPolicies([
    policy("@executioncontrolprotocol/budget", "Local Budget").with({
      maxModelCalls: 4,
      maxRetries: 1,
      maxTokens: 8000,
    }),
  ])

  .withHarnesses([
    harness("@executioncontrolprotocol/workflow-authoring", "Workflow Authoring")
      .uses("@executioncontrolprotocol/ollama.generate")
      .with({
        system: "Return only ECP TOON workflow text. No markdown fences.",

        context: {
          includeEnvironmentDescriptor: true,
          descriptorFormat: "@executioncontrolprotocol/format-toon",
        },

        output: {
          schema: "@executioncontrolprotocol.workflow",
          format: "@executioncontrolprotocol/format-toon",
          validate: true,
        },

        repair: {
          enabled: true,
          maxAttempts: 1,
          includeValidationErrors: true,
        },

        trace: {
          includePrompt: true,
          includeRawOutput: true,
          includeValidation: true,
        },
      }),
  ]);
```

Then invocation:

```ts
const result = await ecp.invoke("@executioncontrolprotocol/workflow-authoring.evaluate")
  .with({
    request: "Create a workflow that echoes hello.",
  });
```

Override provider for Chrome Nano:

```ts
const result = await ecp.invoke("@executioncontrolprotocol/workflow-authoring")
  .uses("@executioncontrolprotocol/chrome-ai.generate")
  .with({
    request: "Create a workflow that echoes hello.",
  });
```

The harness stays the same. Only the delegated `.generate` capability changes.

---

## 5. Revised `defineHarness` handler

The handler should read only `output.format`:

```ts
export const workflowAuthoringHarness = defineHarness(
  "@executioncontrolprotocol",
  "workflow-authoring"
)
  .withConfig(WorkflowAuthoringHarnessConfig)
  .withInput(WorkflowAuthoringHarnessInput)
  .withOutput(WorkflowAuthoringHarnessOutput)
  .usesInterface("@executioncontrolprotocol/model.generate")
  .withHandler(async (input, ctx) => {
    const config = ctx.config;

    const descriptor = config.context.includeEnvironmentDescriptor
      ? await ctx.environment.describe()
      : undefined;

    const descriptorText = descriptor
      ? await ctx.encode(descriptor)
          .uses(config.context.descriptorFormat ?? config.output.format)
          .with({ compact: true })
          .toText()
      : "";

    const prompt = renderCreatePrompt({
      request: input.request,
      descriptor: descriptorText,
    });

    const generated = await ctx.capabilities.call(ctx.uses, {
      system: config.system,
      prompt,
      model: input.model,
      responseFormat: inferResponseFormat(config.output.format),
    });

    const artifact = await ctx.decode(generated.text)
      .uses(config.output.format)
      .to(config.output.schema);

    const validation = config.output.validate
      ? ctx.environment.validate(artifact)
      : undefined;

    return {
      artifact,
      raw: generated.text,
      validation,
      trace: {
        harness: "@executioncontrolprotocol/workflow-authoring",
        provider: ctx.uses,
        model: input.model,
        outputSchema: config.output.schema,
        outputFormat: config.output.format,
        decodeSucceeded: true,
        validationSucceeded: validation?.valid ?? true,
      },
      usage: generated.usage,
    };
  });
```

Helper:

```ts
function inferResponseFormat(format: string) {
  if (format === "@executioncontrolprotocol/format-toon") return "toon";
  if (format === "@executioncontrolprotocol/format-json") return "json";
  return "text";
}
```

---

## 6. Revised config schema

```ts
const WorkflowAuthoringHarnessConfig = z.object({
  system: z.string().default(
    "Return only ECP TOON workflow text. No markdown fences."
  ),

  context: z.object({
    includeEnvironmentDescriptor: z.boolean().default(true),
    descriptorFormat: z.string().optional(),
    includeCurrentWorkflow: z.boolean().default(false),
  }).default({}),

  output: z.object({
    schema: z.string().default("@executioncontrolprotocol.workflow"),
    format: z.string().default("@executioncontrolprotocol/format-toon"),
    validate: z.boolean().default(true),
    apply: z.string().optional(),
    validateResult: z.boolean().optional(),
  }).default({}),

  repair: z.object({
    enabled: z.boolean().default(true),
    maxAttempts: z.number().default(1),
    includeValidationErrors: z.boolean().default(true),
  }).default({}),

  trace: z.object({
    includePrompt: z.boolean().default(true),
    includeRawOutput: z.boolean().default(true),
    includeValidation: z.boolean().default(true),
  }).default({}),
});
```

This is cleaner than carrying both `format` and `decode`.

---

## 7. Binding-time dependency resolution rule

I’d document this clearly:

> ECP builders are declarative. They collect references but do not require references to be resolvable at declaration time. Environment resolution happens after all bindings have been collected.

That means these are equivalent:

```ts
environment("demo")
  .withExtensions([
    extension("@executioncontrolprotocol/ollama").with({}),
    extension("@executioncontrolprotocol/format-toon").with({}),
  ])
  .withHarnesses([
    harness("@executioncontrolprotocol/workflow-authoring")
      .uses("@executioncontrolprotocol/ollama.generate")
      .with({
        output: {
          schema: "@executioncontrolprotocol.workflow",
          format: "@executioncontrolprotocol/format-toon",
        },
      }),
  ]);
```

And:

```ts
environment("demo")
  .withHarnesses([
    harness("@executioncontrolprotocol/workflow-authoring")
      .uses("@executioncontrolprotocol/ollama.generate")
      .with({
        output: {
          schema: "@executioncontrolprotocol.workflow",
          format: "@executioncontrolprotocol/format-toon",
        },
      }),
  ])
  .withExtensions([
    extension("@executioncontrolprotocol/ollama").with({}),
    extension("@executioncontrolprotocol/format-toon").with({}),
  ]);
```

Both should compile to the same environment.

---

## 8. Best current rule set

I’d lock in these rules:

| Rule                  | Decision                                                                |
| --------------------- | ----------------------------------------------------------------------- |
| Harness invocation    | Use `ecp.invoke(harnessId)`                                             |
| Provider selection    | Use `.uses("@executioncontrolprotocol/provider.generate")`              |
| Provider default      | Environment harness binding supplies default `.uses()`                  |
| Runtime override      | `ecp.invoke(...).uses(...)` overrides default                           |
| Output format         | Use only `output.format`                                                |
| Decode capability     | Inferred from `output.format`                                           |
| Formatter requirement | `output.format` must be registered/bound                                |
| Resolution timing     | Resolve after all environment bindings are collected                    |
| Builder order         | Binding order should not affect dependency availability                 |
| Validation            | Environment validates harness provider, formatter, schema, and policies |

This keeps the design tight:

```ts
ecp.invoke("@executioncontrolprotocol/workflow-authoring.evaluate")
  .uses("@executioncontrolprotocol/ollama.generate")
  .with({ request })
```

The harness becomes the ECP-native replacement for the browser service, and the environment remains declarative and order-insensitive.
