# ECP encoder implementation spec

Yes. Here is the full implementation spec for the complete round trip:

```txt
Fluent API source
→ @executioncontrolprotocol.workflow JSON manifest
→ TOON
→ @executioncontrolprotocol.workflow JSON manifest
→ Fluent API source
```

This should be directly usable by a coding agent.

---

# ECP Format Round Trip Implementation Spec

## 1. Goal

Implement an environment-aware format system that allows ECP workflows to move between:

```txt
Fluent API TypeScript
@executioncontrolprotocol.workflow JSON manifest
TOON compact representation
Fluent API TypeScript
```

The canonical source of truth remains the `@executioncontrolprotocol.workflow` manifest. The current spec already defines workflow manifests as portable execution graphs that do not contain runtime, extension, policy, secret, or environment details.  The implementation report also confirms the current forward path: `workflow().toManifest()` builds a workflow manifest, and `compileWorkflowSource` compiles TypeScript/JavaScript workflow source into a manifest.

---

# 2. Decisions to implement

## 2.1 Canonical IR

The canonical IR is always:

```txt
@executioncontrolprotocol.workflow
```

Format conversions do not replace this. They produce views, compressed representations, or authoring aids.

## 2.2 Environment-scoped encoding

Encoding and decoding are environment operations:

```ts
const encoded = await env
  .encode(manifest)
  .uses("@executioncontrolprotocol/format-toon")
  .process();

const decoded = await env
  .decode(encoded.content)
  .uses("@executioncontrolprotocol/format-toon")
  .process();
```

## 2.3 Format extensions are normal extensions

Format extensions register normal ECP capabilities:

```txt
@executioncontrolprotocol/format-toon.encode
@executioncontrolprotocol/format-toon.decode
@executioncontrolprotocol/format-fluent.encode
```

The existing ECP model already uses definitions, bindings, and invocations where extensions define capabilities and environments bind extensions.

## 2.4 No new lifecycle hooks

Do not add format lifecycle hooks. Encoding and decoding are utility operations, not workflow runs.

No:

```txt
format:beforeEncode
format:afterDecode
workflow:encoded
workflow:decoded
```

No workflow lifecycle emission during encode/decode.

## 2.5 `const env = environment(...)` style

All docs, tests, and examples should use:

```ts
const env = environment(...);
```

Then:

```ts
env.encode(...)
env.decode(...)
env.validate(...)
env.run(...)
env.describe(...)
env.search(...)
```

Use `ecp` only for SDK namespace imports or browser global references.

---

# 3. Target developer experience

## 3.1 Full round trip

```ts
import {
  environment,
  extension,
  workflow,
  step,
  ref,
} from "@executioncontrolprotocol/core";

import {
  registerFormatToonExtension,
} from "@executioncontrolprotocol/format-toon";

import {
  registerFormatFluentExtension,
} from "@executioncontrolprotocol/format-fluent";

registerFormatToonExtension();
registerFormatFluentExtension();

const env = environment("demo", "Demo Environment")
  .withExtensions([
    extension("@executioncontrolprotocol/format-toon").with({}),
    extension("@executioncontrolprotocol/format-fluent").with({}),
  ]);

const source = `
  import { workflow, step, ref } from "@executioncontrolprotocol/core";

  export default workflow("Weekly Brief")
    .id("weekly-brief")
    .run([
      step("@executioncontrolprotocol/memory.search", "Collect Signals")
        .id("collect-signals")
        .with({
          query: "weekly risks and decisions",
          since: "7d",
        })
        .as("signals"),

      step("@executioncontrolprotocol/openai.generate", "Write Brief")
        .id("write-brief")
        .with({
          prompt: "Create a concise brief",
          context: ref("signals.results"),
        })
        .as("brief"),
    ]);
`;

// Fluent → JSON manifest
const compiled = await compileWorkflowSource({
  source,
  filename: "workflow.ts",
});

const manifest = compiled.manifest;

// JSON manifest → TOON
const toon = await env
  .encode(manifest)
  .uses("@executioncontrolprotocol/format-toon")
  .process();

// TOON → JSON manifest
const decoded = await env
  .decode(toon.content)
  .uses("@executioncontrolprotocol/format-toon")
  .process();

const decodedManifest = decoded.document;

// JSON manifest → Fluent API source
const fluent = await env
  .encode(decodedManifest)
  .uses("@executioncontrolprotocol/format-fluent")
  .process();

console.log(fluent.content);
```

---

# 4. Package layout

Add:

```txt
packages/
  types/
    src/
      encoding.ts

  core/
    src/
      encoding/
        encode-builder.ts
        decode-builder.ts
        json-codec.ts
        utility-context.ts
        contracts.ts
        errors.ts
        index.ts

  extensions/
    format-toon/
      src/
        index.ts
        extension.ts
        encode.ts
        decode.ts
        parser.ts
        serializer.ts
        grammar.ts
        schemas.ts
        normalize.ts
      test/
        encode.test.ts
        decode.test.ts
        roundtrip.test.ts
        refs-state.test.ts
        flow.test.ts
        invalid.test.ts

    format-fluent/
      src/
        index.ts
        extension.ts
        encode.ts
        render-workflow.ts
        render-node.ts
        render-value.ts
        render-expr.ts
        printer.ts
        schemas.ts
      test/
        encode.test.ts
        roundtrip.test.ts
        refs-state.test.ts
        flow.test.ts
        compile-generated.test.ts
```

Published packages:

```txt
@executioncontrolprotocol/format-toon
@executioncontrolprotocol/format-fluent
```

Optional convenience re-export:

```txt
@executioncontrolprotocol/extensions
```

---

# 5. Type additions

Add to `@executioncontrolprotocol/types`.

## 5.1 New schemas

```ts
export type EcpSchema =
  | "@executioncontrolprotocol.workflow"
  | "@executioncontrolprotocol.environment"
  | "@executioncontrolprotocol.environment.describe"
  | "@executioncontrolprotocol.environment.search"
  | "@executioncontrolprotocol.run.request"
  | "@executioncontrolprotocol.run.result"
  | "@executioncontrolprotocol.run.event"
  | "@executioncontrolprotocol.validation.result"
  | "@executioncontrolprotocol.encoded"
  | "@executioncontrolprotocol.decoded";
```

## 5.2 Encoding constants

```ts
export const ECP_FORMAT_CAPABILITY_NAMES = {
  ENCODE: "encode",
  DECODE: "decode",
} as const;

export const ECP_FORMATS = {
  JSON: "json",
  TOON: "toon",
  FLUENT: "fluent",
} as const;
```

## 5.3 Error codes

```ts
export const ECP_ENCODING_ERROR_CODES = {
  FORMAT_EXTENSION_NOT_FOUND: "FORMAT_EXTENSION_NOT_FOUND",
  FORMAT_ENCODER_NOT_FOUND: "FORMAT_ENCODER_NOT_FOUND",
  FORMAT_DECODER_NOT_FOUND: "FORMAT_DECODER_NOT_FOUND",
  FORMAT_ENCODER_INVALID_CONTRACT: "FORMAT_ENCODER_INVALID_CONTRACT",
  FORMAT_DECODER_INVALID_CONTRACT: "FORMAT_DECODER_INVALID_CONTRACT",
  FORMAT_ENCODE_FAILED: "FORMAT_ENCODE_FAILED",
  FORMAT_DECODE_FAILED: "FORMAT_DECODE_FAILED",
  FORMAT_UNSUPPORTED_SOURCE_SCHEMA: "FORMAT_UNSUPPORTED_SOURCE_SCHEMA",
  FORMAT_UNSUPPORTED_TARGET_SCHEMA: "FORMAT_UNSUPPORTED_TARGET_SCHEMA",
} as const;
```

## 5.4 Encoded artifact

```ts
export interface EncodedArtifact<T = unknown> {
  schema: "@executioncontrolprotocol.encoded";
  version: EcpVersion;
  format: string;
  mediaType?: string;
  sourceSchema?: EcpSchema;
  content: T;
  diagnostics?: ValidationIssue[];
}
```

## 5.5 Decode result

```ts
export interface DecodeResult<T = unknown> {
  schema: "@executioncontrolprotocol.decoded";
  version: EcpVersion;
  targetSchema?: EcpSchema;
  document: T;
  diagnostics?: ValidationIssue[];
}
```

## 5.6 Encode capability input

```ts
export interface EcpEncodeInput {
  source: unknown;
  sourceSchema?: EcpSchema;
  format?: string;
  options?: {
    compact?: boolean;
    include?: string[];
    as?: "object" | "string";
  };
}
```

## 5.7 Decode capability input

```ts
export interface EcpDecodeInput {
  content: unknown;
  format?: string;
  targetSchema?: EcpSchema;
  options?: {
    strict?: boolean;
  };
}
```

---

# 6. Core environment API

Extend `Environment`.

```ts
interface Environment {
  compile(): EnvironmentManifest;
  validate(workflow?: WorkflowManifest): ValidationResult | Promise<ValidationResult>;
  describe(query?: DescribeQuery): Promise<EnvironmentDescriptor>;
  search(query: string, options?: SearchOptions): Promise<SearchResult>;
  run(workflow: WorkflowManifest, options?: RunOptions): Promise<RunResult>;

  encode(input: unknown): EncodeOperationBuilder;
  decode(input: unknown): DecodeOperationBuilder;
}
```

The current environment API already owns `compile`, `validate`, `describe`, `search`, and `run`; this change extends that same environment-aware surface.

---

# 7. Encode operation builder

## 7.1 Interface

```ts
export interface EncodeOperationBuilder {
  uses(extensionId: NamespacedId | string): this;
  as(format: string): this;
  compact(enabled?: boolean): this;
  asString(): this;
  asObject(): this;
  include(fields: string[]): this;
  process(): Promise<EncodedArtifact>;
}
```

## 7.2 Behavior

```ts
const encoded = await env
  .encode(manifest)
  .uses("@executioncontrolprotocol/format-toon")
  .process();
```

Resolution:

```txt
@executioncontrolprotocol/format-toon
→ @executioncontrolprotocol/format-toon.encode
```

If no `.uses(...)` is provided:

```ts
const encoded = await env
  .encode(manifest)
  .process();
```

Use core JSON encoder.

Default format inference:

| Input                                       | Default format |
| ------------------------------------------- | -------------- |
| `@executioncontrolprotocol.workflow` object | `json`         |
| Unknown object                              | `json`         |
| String                                      | `json` string  |

---

# 8. Decode operation builder

## 8.1 Interface

```ts
export interface DecodeOperationBuilder {
  uses(extensionId: NamespacedId | string): this;
  from(format: string): this;
  to(targetSchema: EcpSchema): this;
  strict(enabled?: boolean): this;
  process<T = unknown>(): Promise<DecodeResult<T>>;
}
```

## 8.2 Behavior

```ts
const decoded = await env
  .decode(toon.content)
  .uses("@executioncontrolprotocol/format-toon")
  .process();
```

Resolution:

```txt
@executioncontrolprotocol/format-toon
→ @executioncontrolprotocol/format-toon.decode
```

Target inference:

1. Try to infer from encoded content header.
2. If no header exists, default to `@executioncontrolprotocol.workflow` for v1.
3. If `.to(...)` is provided, treat it as a validation constraint.

So this is optional:

```ts
const decoded = await env
  .decode(toon.content)
  .uses("@executioncontrolprotocol/format-toon")
  .to("@executioncontrolprotocol.workflow")
  .strict()
  .process();
```

---

# 9. Core JSON codec

## 9.1 Encode JSON

```ts
function encodeJson(input: unknown, options: EncodeJsonOptions): EncodedArtifact {
  const sourceSchema = getEcpSchema(input);

  if (options.as === "string") {
    return {
      schema: "@executioncontrolprotocol.encoded",
      version: LATEST_ECP_VERSION,
      format: "json",
      mediaType: "application/ecp+json",
      sourceSchema,
      content: JSON.stringify(input, null, options.compact ? 0 : 2),
    };
  }

  return {
    schema: "@executioncontrolprotocol.encoded",
    version: LATEST_ECP_VERSION,
    format: "json",
    mediaType: "application/ecp+json",
    sourceSchema,
    content: input,
  };
}
```

## 9.2 Decode JSON

```ts
function decodeJson<T = unknown>(
  input: unknown,
  options: DecodeJsonOptions
): DecodeResult<T> {
  const document =
    typeof input === "string" ? JSON.parse(input) : input;

  return {
    schema: "@executioncontrolprotocol.decoded",
    version: LATEST_ECP_VERSION,
    targetSchema: options.targetSchema ?? getEcpSchema(document),
    document: document as T,
    diagnostics: [],
  };
}
```

---

# 10. Utility capability invocation

Format capabilities are invoked outside workflow execution.

They should receive a utility context that is intentionally limited.

```ts
export interface UtilityCapabilityContext {
  environment: {
    id: string;
    label?: string;
  };
  registry: Registry;
  logger: Logger;
  usage: UsageLedger;
  store: StoreContext;
}
```

`store` should be an unavailable store:

```ts
function createUnavailableStoreContext(): StoreContext {
  return {
    read: async () => {
      throw new Error("Utility capabilities cannot read workflow state.");
    },
    set: async () => {
      throw new Error("Utility capabilities cannot mutate workflow state.");
    },
    replace: async () => {
      throw new Error("Utility capabilities cannot mutate workflow state.");
    },
    merge: async () => {
      throw new Error("Utility capabilities cannot mutate workflow state.");
    },
    append: async () => {
      throw new Error("Utility capabilities cannot mutate workflow state.");
    },
  };
}
```

This matters because `state()` is a controlled mutable handle in workflow execution, while encode/decode are utility operations and should not mutate run state. The current state model defines `state(path)` as a mutable handle and `ref(path)` as a read of committed workflow state.

---

# 11. Contract resolution

## 11.1 Encode

```ts
function resolveEncoder(env: Environment, extensionId: string): CapabilityDefinition {
  const normalized = normalizeNamespacedId(extensionId);
  const capabilityId = `${normalized}.encode`;

  const extensionDef = env.getRegistry().getExtension(normalized);
  if (!extensionDef) {
    throw new EcpError("FORMAT_EXTENSION_NOT_FOUND", {
      message: `Extension ${normalized} is not registered.`,
    });
  }

  const capabilityDef = env.getRegistry().getCapability(capabilityId);
  if (!capabilityDef) {
    throw new EcpError("FORMAT_ENCODER_NOT_FOUND", {
      message: `Extension ${normalized} does not provide ${capabilityId}.`,
    });
  }

  validateEncodeCapabilityContract(capabilityDef);

  return capabilityDef;
}
```

## 11.2 Decode

```ts
function resolveDecoder(env: Environment, extensionId: string): CapabilityDefinition {
  const normalized = normalizeNamespacedId(extensionId);
  const capabilityId = `${normalized}.decode`;

  const extensionDef = env.getRegistry().getExtension(normalized);
  if (!extensionDef) {
    throw new EcpError("FORMAT_EXTENSION_NOT_FOUND", {
      message: `Extension ${normalized} is not registered.`,
    });
  }

  const capabilityDef = env.getRegistry().getCapability(capabilityId);
  if (!capabilityDef) {
    throw new EcpError("FORMAT_DECODER_NOT_FOUND", {
      message: `Extension ${normalized} does not provide ${capabilityId}.`,
    });
  }

  validateDecodeCapabilityContract(capabilityDef);

  return capabilityDef;
}
```

---

# 12. Reserved capability conventions

Add validation helpers:

```ts
validateReservedCapabilityNames(extensionDef)
validateEncodeCapabilityContract(capabilityDef)
validateDecodeCapabilityContract(capabilityDef)
```

Rules:

| Rule                                                            | Severity |
| --------------------------------------------------------------- | -------- |
| `encode` capability on any extension with non-standard contract | Warning  |
| `decode` capability on any extension with non-standard contract | Warning  |
| `@*/format-*` extension without `encode`                        | Warning  |
| `env.encode(...).uses(extension)` and no `.encode`              | Error    |
| `env.decode(...).uses(extension)` and no `.decode`              | Error    |
| Normal domain capability named `encode`                         | Allowed  |

Examples:

Allowed:

```txt
@vendor/video.encode
```

Required when used by `env.encode()`:

```txt
@vendor/format-video.encode
```

---

# 13. TOON extension

## 13.1 Package

```txt
@executioncontrolprotocol/format-toon
```

## 13.2 Exports

```ts
export const formatToonExtension: ExtensionDefinition;

export function registerFormatToonExtension(
  registry = globalRegistry
): void;

export function encodeWorkflowToToon(
  input: EcpEncodeInput,
  ctx: UtilityCapabilityContext
): EncodedArtifact<string>;

export function decodeToonToWorkflow(
  input: EcpDecodeInput,
  ctx: UtilityCapabilityContext
): DecodeResult<WorkflowManifest>;
```

## 13.3 Definition

```ts
export const formatToonExtension = defineExtension("@executioncontrolprotocol", "format-toon")
  .withCapabilities([
    capability("encode")
      .withInput(EcpEncodeInputSchema)
      .withOutput(EcpEncodedArtifactSchema)
      .withHandler(encodeWorkflowToToon),

    capability("decode")
      .withInput(EcpDecodeInputSchema)
      .withOutput(EcpDecodeResultSchema)
      .withHandler(decodeToonToWorkflow),
  ])
  .build();
```

## 13.4 Usage

```ts
registerFormatToonExtension();

const env = environment("demo")
  .withExtensions([
    extension("@executioncontrolprotocol/format-toon").with({}),
  ]);

const toon = await env
  .encode(manifest)
  .uses("@executioncontrolprotocol/format-toon")
  .process();

const decoded = await env
  .decode(toon.content)
  .uses("@executioncontrolprotocol/format-toon")
  .process();
```

---

# 14. TOON grammar v1

## 14.1 Header

```txt
schema: @executioncontrolprotocol.workflow
version: 1.0
workflow: weekly-brief "Weekly Brief"
```

## 14.2 Step

```txt
step collect-signals "Collect Signals"
  uses: @executioncontrolprotocol/memory.search
  in:
    query: weekly risks and decisions
    since: 7d
  out: signals
```

## 14.3 Ref

Manifest:

```json
{ "$ref": "state.signals.results" }
```

TOON:

```txt
$signals.results
```

## 14.4 State handle

Manifest:

```json
{ "$state": "creativeInputs" }
```

TOON:

```txt
~creativeInputs
```

## 14.5 Commit mode

```txt
out: image replace
```

Manifest:

```json
{
  "commitAs": "image",
  "commitMode": "replace"
}
```

## 14.6 Condition

```txt
when: brandReview.approved == false
```

Manifest:

```json
{
  "when": {
    "eq": ["brandReview.approved", false]
  }
}
```

## 14.7 Loop

```txt
loop create-validate-fix "Create, Validate, Fix"
  until: brandReview.approved == true
  max: 3

  step generate-image "Generate Image"
    uses: @executioncontrolprotocol/firefly.generateImage
    in:
      prompt: $creativeInputs.generationPrompt
      controls: $creativeInputs.generationControls
    out: image replace

  step validate-image "Validate Image"
    uses: @executioncontrolprotocol/openai.evaluate
    in:
      artifact: $image
    out: brandReview replace
end
```

## 14.8 Parallel

```txt
parallel generate-assets "Generate Assets"

  branch copy
    step generate-copy "Generate Copy"
      uses: @executioncontrolprotocol/openai.generate
      in:
        prompt: Write campaign copy
      out: copy
  end

  branch image
    step generate-image "Generate Image"
      uses: @executioncontrolprotocol/firefly.generateImage
      in:
        prompt: Create campaign image
      out: image
  end
end
```

## 14.9 Branch

```txt
branch notify-review "Notify Review Result"

  case approved when brandReview.approved == true
    step send-approved "Send Approved"
      uses: @executioncontrolprotocol/slack.send
      in:
        message: Approved
  end

  case rejected when brandReview.approved == false
    step send-rejected "Send Rejected"
      uses: @executioncontrolprotocol/slack.send
      in:
        message: Rejected
  end
end
```

---

# 15. TOON encoder implementation

## 15.1 Entry

```ts
export function encodeWorkflowToToon(
  input: EcpEncodeInput,
  ctx: UtilityCapabilityContext
): EncodedArtifact<string> {
  if (input.sourceSchema && input.sourceSchema !== "@executioncontrolprotocol.workflow") {
    throw new EcpError("FORMAT_UNSUPPORTED_SOURCE_SCHEMA", {
      message: `TOON encoder only supports @executioncontrolprotocol.workflow.`,
    });
  }

  const manifest = WorkflowManifestSchema.parse(input.source);

  const content = serializeWorkflowManifestToToon(manifest, {
    compact: input.options?.compact ?? false,
  });

  return {
    schema: "@executioncontrolprotocol.encoded",
    version: LATEST_ECP_VERSION,
    format: "toon",
    mediaType: "text/ecp-toon",
    sourceSchema: "@executioncontrolprotocol.workflow",
    content,
    diagnostics: [],
  };
}
```

## 15.2 Serializer responsibilities

```ts
serializeWorkflowManifestToToon(manifest)
serializeWorkflowNode(node, indent)
serializeStepNode(step, indent)
serializeLoopNode(loop, indent)
serializeParallelNode(parallel, indent)
serializeBranchNode(branch, indent)
serializeInputValue(value)
serializeExprValue(expr)
```

## 15.3 Value serialization

| Manifest value            | TOON                                       |
| ------------------------- | ------------------------------------------ |
| string                    | bare string unless quoting required        |
| number                    | number literal                             |
| boolean                   | `true` / `false`                           |
| null                      | `null`                                     |
| array                     | JSON inline for v1                         |
| object                    | nested block or JSON inline for complex v1 |
| `{ "$ref": "state.a.b" }` | `$a.b`                                     |
| `{ "$state": "a.b" }`     | `~a.b`                                     |

---

# 16. TOON decoder implementation

## 16.1 Entry

```ts
export function decodeToonToWorkflow(
  input: EcpDecodeInput,
  ctx: UtilityCapabilityContext
): DecodeResult<WorkflowManifest> {
  const target = input.targetSchema ?? "@executioncontrolprotocol.workflow";

  if (target !== "@executioncontrolprotocol.workflow") {
    throw new EcpError("FORMAT_UNSUPPORTED_TARGET_SCHEMA", {
      message: `TOON decoder only supports @executioncontrolprotocol.workflow.`,
    });
  }

  const content = String(input.content);
  const document = parseToonWorkflow(content);

  const validation = validateWorkflow(document);

  if (!validation.valid && input.options?.strict) {
    throw new EcpError("FORMAT_DECODE_FAILED", {
      message: "TOON decoded into an invalid workflow manifest.",
      diagnostics: validation.errors,
    });
  }

  return {
    schema: "@executioncontrolprotocol.decoded",
    version: LATEST_ECP_VERSION,
    targetSchema: "@executioncontrolprotocol.workflow",
    document,
    diagnostics: [...validation.errors, ...validation.warnings],
  };
}
```

## 16.2 Parser responsibilities

```ts
parseToonWorkflow(text)
parseHeader(lines)
parseWorkflowLine(line)
parseNodes(lines)
parseStep(lines)
parseLoop(lines)
parseParallel(lines)
parseBranch(lines)
parseInputBlock(lines)
parseValue(value)
parseExpr(expr)
```

## 16.3 Value parsing

| TOON               | Manifest value                        |
| ------------------ | ------------------------------------- |
| `$signals.results` | `{ "$ref": "state.signals.results" }` |
| `~creativeInputs`  | `{ "$state": "creativeInputs" }`      |
| `true`             | `true`                                |
| `false`            | `false`                               |
| `null`             | `null`                                |
| numeric literal    | number                                |
| quoted string      | string                                |
| bare string        | string                                |

---

# 17. Fluent format extension

## 17.1 Package

```txt
@executioncontrolprotocol/format-fluent
```

## 17.2 Purpose

Convert `@executioncontrolprotocol.workflow` manifests back into TypeScript Fluent API source code.

This fills the missing reverse path:

```txt
@executioncontrolprotocol.workflow JSON manifest
→ Fluent API TypeScript
```

## 17.3 Exports

```ts
export const formatFluentExtension: ExtensionDefinition;

export function registerFormatFluentExtension(
  registry = globalRegistry
): void;

export function encodeWorkflowToFluent(
  input: EcpEncodeInput,
  ctx: UtilityCapabilityContext
): EncodedArtifact<string>;
```

## 17.4 Definition

```ts
export const formatFluentExtension = defineExtension("@executioncontrolprotocol", "format-fluent")
  .withCapabilities([
    capability("encode")
      .withInput(EcpEncodeInputSchema)
      .withOutput(EcpEncodedArtifactSchema)
      .withHandler(encodeWorkflowToFluent),
  ])
  .build();
```

No `decode` for v1. Fluent → manifest is already handled by `compileWorkflowSource`.

---

# 18. Fluent encoder API

```ts
registerFormatFluentExtension();

const env = environment("demo")
  .withExtensions([
    extension("@executioncontrolprotocol/format-fluent").with({}),
  ]);

const fluent = await env
  .encode(manifest)
  .uses("@executioncontrolprotocol/format-fluent")
  .process();

console.log(fluent.content);
```

Output:

```ts
import {
  workflow,
  step,
  ref,
} from "@executioncontrolprotocol/core";

export default workflow("Weekly Brief")
  .id("weekly-brief")
  .run([
    step("@executioncontrolprotocol/memory.search", "Collect Signals")
      .id("collect-signals")
      .with({
        query: "weekly risks and decisions",
        since: "7d",
      })
      .as("signals"),

    step("@executioncontrolprotocol/openai.generate", "Write Brief")
      .id("write-brief")
      .with({
        prompt: "Create a concise brief",
        context: ref("signals.results"),
      })
      .as("brief"),
  ]);
```

---

# 19. Fluent encoder implementation

## 19.1 Entry

```ts
export function encodeWorkflowToFluent(
  input: EcpEncodeInput,
  ctx: UtilityCapabilityContext
): EncodedArtifact<string> {
  if (input.sourceSchema && input.sourceSchema !== "@executioncontrolprotocol.workflow") {
    throw new EcpError("FORMAT_UNSUPPORTED_SOURCE_SCHEMA", {
      message: `Fluent encoder only supports @executioncontrolprotocol.workflow.`,
    });
  }

  const manifest = WorkflowManifestSchema.parse(input.source);

  const content = renderWorkflowManifestToFluent(manifest, {
    compact: input.options?.compact ?? false,
  });

  return {
    schema: "@executioncontrolprotocol.encoded",
    version: LATEST_ECP_VERSION,
    format: "fluent",
    mediaType: "text/typescript",
    sourceSchema: "@executioncontrolprotocol.workflow",
    content,
    diagnostics: [],
  };
}
```

## 19.2 Renderer responsibilities

```ts
renderWorkflowManifestToFluent(manifest)
renderImports(requiredHelpers)
renderWorkflowBuilder(manifest)
renderNode(node)
renderStepNode(step)
renderLoopNode(loop)
renderParallelNode(parallel)
renderBranchNode(branch)
renderInputObject(input)
renderInputValue(value)
renderExprValue(expr)
```

## 19.3 Required import detection

Detect helpers needed by manifest:

| Manifest feature     | Import             |
| -------------------- | ------------------ |
| Always               | `workflow`, `step` |
| `$ref`               | `ref`              |
| `$state`             | `state`            |
| `when`, loop `until` | `expr`             |
| Loop node            | `loop`             |
| Parallel node        | `parallel`         |
| Branch node          | `branch`           |

Example:

```ts
import {
  workflow,
  step,
  ref,
  state,
  expr,
  loop,
  parallel,
  branch,
} from "@executioncontrolprotocol/core";
```

## 19.4 Render step

Manifest:

```json
{
  "id": "write-brief",
  "label": "Write Brief",
  "uses": "@executioncontrolprotocol/openai.generate",
  "input": {
    "prompt": "Create a concise brief",
    "context": { "$ref": "state.signals.results" }
  },
  "commitAs": "brief",
  "commitMode": "replace"
}
```

Fluent:

```ts
step("@executioncontrolprotocol/openai.generate", "Write Brief")
  .id("write-brief")
  .with({
    prompt: "Create a concise brief",
    context: ref("signals.results"),
  })
  .as("brief", { mode: "replace" })
```

## 19.5 Render input values

| Manifest value            | Fluent              |
| ------------------------- | ------------------- |
| `{ "$ref": "state.a.b" }` | `ref("a.b")`        |
| `{ "$state": "a.b" }`     | `state("a.b")`      |
| string                    | JSON string literal |
| number                    | number literal      |
| boolean                   | boolean literal     |
| null                      | `null`              |
| object                    | object literal      |
| array                     | array literal       |

## 19.6 Render expressions

Manifest:

```json
{ "eq": ["brandReview.approved", true] }
```

Fluent:

```ts
expr.eq("brandReview.approved", true)
```

Manifest:

```json
{ "neq": ["brandReview.approved", false] }
```

Fluent:

```ts
expr.neq("brandReview.approved", false)
```

## 19.7 Render loop

```ts
loop(
  {
    label: "Create, Validate, Fix",
    until: expr.eq("brandReview.approved", true),
    maxRounds: 3,
    id: "create-validate-fix",
  },
  [
    step("@executioncontrolprotocol/firefly.generateImage", "Generate Image")
      .id("generate-image")
      .with({
        prompt: ref("creativeInputs.generationPrompt"),
      })
      .as("image", { mode: "replace" }),
  ]
)
```

## 19.8 Render parallel

```ts
parallel(
  [
    [
      step("@executioncontrolprotocol/openai.generate", "Generate Copy")
        .id("generate-copy")
        .with({ prompt: "Write copy" })
        .as("copy"),
    ],
    [
      step("@executioncontrolprotocol/firefly.generateImage", "Generate Image")
        .id("generate-image")
        .with({ prompt: "Create image" })
        .as("image"),
    ],
  ],
  {
    id: "generate-assets",
    label: "Generate Assets",
  }
)
```

## 19.9 Render branch

```ts
branch(
  [
    step("@executioncontrolprotocol/slack.send", "Send Approved")
      .id("send-approved")
      .when(expr.eq("brandReview.approved", true))
      .with({ message: "Approved" }),

    step("@executioncontrolprotocol/slack.send", "Send Rejected")
      .id("send-rejected")
      .when(expr.eq("brandReview.approved", false))
      .with({ message: "Rejected" }),
  ],
  {
    id: "notify-review",
    label: "Notify Review Result",
  }
)
```

---

# 20. Full round-trip command flow

## 20.1 Programmatic

```ts
registerFormatToonExtension();
registerFormatFluentExtension();

const env = environment("roundtrip")
  .withExtensions([
    extension("@executioncontrolprotocol/format-toon").with({}),
    extension("@executioncontrolprotocol/format-fluent").with({}),
  ]);

const compiled = await compileWorkflowSource({
  source: fluentSource,
  filename: "workflow.ts",
});

const manifestA = compiled.manifest;

const toon = await env
  .encode(manifestA)
  .uses("@executioncontrolprotocol/format-toon")
  .process();

const decoded = await env
  .decode(toon.content)
  .uses("@executioncontrolprotocol/format-toon")
  .process();

const manifestB = decoded.document;

const fluent = await env
  .encode(manifestB)
  .uses("@executioncontrolprotocol/format-fluent")
  .process();

const compiledAgain = await compileWorkflowSource({
  source: fluent.content,
  filename: "workflow.generated.ts",
});

const manifestC = compiledAgain.manifest;

expect(normalizeWorkflowManifest(manifestC))
  .toEqual(normalizeWorkflowManifest(manifestA));
```

## 20.2 CLI future

Later:

```bash
ecp compile workflow.ts -o workflow.json
ecp encode workflow.json --format toon --env env.ts -o workflow.toon
ecp decode workflow.toon --format toon --env env.ts -o workflow.json
ecp encode workflow.json --format fluent --env env.ts -o workflow.generated.ts
```

CLI is not required for v1, but the architecture should support it.

---

# 21. Normalization utility

Round trips may reorder imports or omit defaults. Add:

```ts
normalizeWorkflowManifest(manifest: WorkflowManifest): WorkflowManifest
```

Responsibilities:

* normalize missing `type` on step nodes to `"step"` or remove consistently
* normalize absent `commitMode` to undefined, not default
* normalize object key order
* normalize generated IDs if needed
* preserve explicit IDs
* preserve labels
* preserve `uses`
* preserve `input`
* preserve `commitAs`
* preserve flow structure

Do not normalize away semantically meaningful differences.

---

# 22. Test plan

## 22.1 Core builder tests

### `env.encode()` returns builder

```ts
it("returns an encode operation builder", () => {
  const env = environment("test");
  const builder = env.encode(manifest);

  expect(builder.uses).toBeTypeOf("function");
  expect(builder.process).toBeTypeOf("function");
});
```

### JSON encode default

```ts
it("encodes JSON by default when no extension is used", async () => {
  const env = environment("test");

  const encoded = await env
    .encode(manifest)
    .process();

  expect(encoded.schema).toBe("@executioncontrolprotocol.encoded");
  expect(encoded.format).toBe("json");
  expect(encoded.content).toEqual(manifest);
});
```

### JSON decode default

```ts
it("decodes JSON by default when no extension is used", async () => {
  const env = environment("test");

  const decoded = await env
    .decode(JSON.stringify(manifest))
    .process();

  expect(decoded.schema).toBe("@executioncontrolprotocol.decoded");
  expect(decoded.document).toEqual(manifest);
});
```

### Missing encoder extension

```ts
it("fails when encoder extension is not registered", async () => {
  const env = environment("test");

  await expect(
    env
      .encode(manifest)
      .uses("@executioncontrolprotocol/format-toon")
      .process()
  ).rejects.toMatchObject({
    code: "FORMAT_EXTENSION_NOT_FOUND",
  });
});
```

### Missing `.encode` capability

```ts
it("fails when selected format extension has no encode capability", async () => {
  registerSomeExtensionWithoutEncode();

  const env = environment("test")
    .withExtensions([
      extension("@test/not-codec").with({}),
    ]);

  await expect(
    env
      .encode(manifest)
      .uses("@test/not-codec")
      .process()
  ).rejects.toMatchObject({
    code: "FORMAT_ENCODER_NOT_FOUND",
  });
});
```

### Missing `.decode` capability

```ts
it("fails when selected format extension has no decode capability", async () => {
  registerEncodeOnlyExtension();

  const env = environment("test")
    .withExtensions([
      extension("@test/encode-only").with({}),
    ]);

  await expect(
    env
      .decode("...")
      .uses("@test/encode-only")
      .process()
  ).rejects.toMatchObject({
    code: "FORMAT_DECODER_NOT_FOUND",
  });
});
```

---

## 22.2 TOON tests

### Simple encode

```ts
it("encodes workflow manifest to TOON", async () => {
  registerFormatToonExtension();

  const env = environment("test")
    .withExtensions([
      extension("@executioncontrolprotocol/format-toon").with({}),
    ]);

  const encoded = await env
    .encode(manifest)
    .uses("@executioncontrolprotocol/format-toon")
    .process();

  expect(encoded.format).toBe("toon");
  expect(encoded.content).toContain("schema: @executioncontrolprotocol.workflow");
  expect(encoded.content).toContain("workflow:");
  expect(encoded.content).toContain("step");
});
```

### Simple decode

```ts
it("decodes TOON to workflow manifest", async () => {
  const decoded = await env
    .decode(toonText)
    .uses("@executioncontrolprotocol/format-toon")
    .process();

  expect(decoded.targetSchema).toBe("@executioncontrolprotocol.workflow");
  expect(decoded.document.schema).toBe("@executioncontrolprotocol.workflow");
});
```

### Ref round trip

```ts
it("round trips refs", async () => {
  const toon = await env
    .encode(refManifest)
    .uses("@executioncontrolprotocol/format-toon")
    .process();

  expect(toon.content).toContain("$signals.results");

  const decoded = await env
    .decode(toon.content)
    .uses("@executioncontrolprotocol/format-toon")
    .process();

  expect(decoded.document.steps[0].input.context).toEqual({
    $ref: "state.signals.results",
  });
});
```

### State handle round trip

```ts
it("round trips state handles", async () => {
  const toon = await env
    .encode(stateManifest)
    .uses("@executioncontrolprotocol/format-toon")
    .process();

  expect(toon.content).toContain("~creativeInputs");

  const decoded = await env
    .decode(toon.content)
    .uses("@executioncontrolprotocol/format-toon")
    .process();

  expect(decoded.document.steps[0].input.target).toEqual({
    $state: "creativeInputs",
  });
});
```

### Flow round trips

Create tests for:

```txt
sequence
loop
parallel
branch
when conditions
commit modes
nested refs
state handles
```

Each should assert:

```ts
expect(normalizeWorkflowManifest(decoded.document))
  .toEqual(normalizeWorkflowManifest(originalManifest));
```

---

## 22.3 Fluent encoder tests

### Manifest to Fluent

```ts
it("encodes workflow manifest to Fluent API source", async () => {
  registerFormatFluentExtension();

  const env = environment("test")
    .withExtensions([
      extension("@executioncontrolprotocol/format-fluent").with({}),
    ]);

  const encoded = await env
    .encode(manifest)
    .uses("@executioncontrolprotocol/format-fluent")
    .process();

  expect(encoded.format).toBe("fluent");
  expect(encoded.content).toContain("export default workflow");
  expect(encoded.content).toContain("step(");
});
```

### Generated Fluent compiles

```ts
it("generated Fluent API source compiles back to manifest", async () => {
  const encoded = await env
    .encode(manifest)
    .uses("@executioncontrolprotocol/format-fluent")
    .process();

  const compiled = await compileWorkflowSource({
    source: encoded.content,
    filename: "generated.workflow.ts",
  });

  expect(normalizeWorkflowManifest(compiled.manifest))
    .toEqual(normalizeWorkflowManifest(manifest));
});
```

### Ref rendering

```ts
expect(encoded.content).toContain('ref("signals.results")');
```

### State rendering

```ts
expect(encoded.content).toContain('state("creativeInputs")');
```

### Expr rendering

```ts
expect(encoded.content).toContain('expr.eq("brandReview.approved", true)');
```

---

## 22.4 Full round-trip test

```ts
it("round trips Fluent → JSON → TOON → JSON → Fluent", async () => {
  registerFormatToonExtension();
  registerFormatFluentExtension();

  const env = environment("test")
    .withExtensions([
      extension("@executioncontrolprotocol/format-toon").with({}),
      extension("@executioncontrolprotocol/format-fluent").with({}),
    ]);

  const compiledA = await compileWorkflowSource({
    source: fluentSource,
    filename: "workflow.ts",
  });

  const manifestA = compiledA.manifest;

  const toon = await env
    .encode(manifestA)
    .uses("@executioncontrolprotocol/format-toon")
    .process();

  const decoded = await env
    .decode(toon.content)
    .uses("@executioncontrolprotocol/format-toon")
    .process();

  const manifestB = decoded.document;

  const fluent = await env
    .encode(manifestB)
    .uses("@executioncontrolprotocol/format-fluent")
    .process();

  const compiledB = await compileWorkflowSource({
    source: fluent.content,
    filename: "workflow.generated.ts",
  });

  expect(normalizeWorkflowManifest(compiledB.manifest))
    .toEqual(normalizeWorkflowManifest(manifestA));
});
```

---

## 22.5 Lifecycle isolation test

```ts
it("does not emit run or step lifecycle during encode/decode", async () => {
  const events: string[] = [];

  registerTelemetryTestExtension({
    onRunBefore: () => events.push("run:before"),
    onStepStarted: () => events.push("step:started"),
  });

  const env = environment("test")
    .withExtensions([
      extension("@test/telemetry").with({}),
      extension("@executioncontrolprotocol/format-toon").with({}),
    ]);

  await env
    .encode(manifest)
    .uses("@executioncontrolprotocol/format-toon")
    .process();

  await env
    .decode(toonText)
    .uses("@executioncontrolprotocol/format-toon")
    .process();

  expect(events).toEqual([]);
});
```

---

# 23. Acceptance criteria

Implementation is complete when all are true:

## Core

* `env.encode(input)` returns `EncodeOperationBuilder`.
* `env.decode(input)` returns `DecodeOperationBuilder`.
* `.uses(extensionId)` selects the format extension.
* `.process()` executes the utility operation.
* `env.encode(...).uses("@x/y").process()` resolves `@x/y.encode`.
* `env.decode(...).uses("@x/y").process()` resolves `@x/y.decode`.
* No `.uses(...)` defaults to JSON.
* Missing extension and missing capabilities throw typed errors.
* Encode/decode do not emit workflow lifecycle events.
* Encode/decode do not mutate workflow state.

## TOON

* `@executioncontrolprotocol/format-toon` registers `encode` and `decode`.
* Manifest → TOON works.
* TOON → manifest works.
* TOON infers `@executioncontrolprotocol.workflow` from the header.
* TOON defaults to `@executioncontrolprotocol.workflow` if no schema header exists.
* Steps, refs, state handles, commit modes, conditions, loops, branches, and parallel nodes round trip.
* Invalid TOON returns diagnostics and strict mode fails.

## Fluent

* `@executioncontrolprotocol/format-fluent` registers `encode`.
* Manifest → Fluent API source works.
* Generated source imports required helpers only.
* Generated source compiles with `compileWorkflowSource`.
* Generated manifest matches the original normalized manifest.
* Refs render as `ref(...)`.
* State handles render as `state(...)`.
* Conditions render as `expr.eq(...)` / `expr.neq(...)`.
* Flow nodes render as `loop(...)`, `parallel(...)`, and `branch(...)`.

## Full round trip

This passes:

```txt
Fluent source
→ compileWorkflowSource
→ manifest A
→ env.encode().uses("@executioncontrolprotocol/format-toon").process()
→ TOON
→ env.decode().uses("@executioncontrolprotocol/format-toon").process()
→ manifest B
→ env.encode().uses("@executioncontrolprotocol/format-fluent").process()
→ Fluent generated source
→ compileWorkflowSource
→ manifest C
```

And:

```ts
normalizeWorkflowManifest(manifestC)
  === normalizeWorkflowManifest(manifestA)
```

---

# 24. Non-goals

Do not implement in this phase:

* `workflow.toTOON()`
* `workflow.toFluent()`
* floating `encode()` / `decode()` as the primary API
* `defineFormat(...)`
* format lifecycle hooks
* TOON as runtime execution format
* Fluent decode capability
* semantic workflow search
* CLI commands, unless trivial after core implementation

---

# 25. Source-of-truth language to merge

```md
## Environment encoding and decoding

ECP environments expose `env.encode(input)` and `env.decode(input)` as environment-aware utility operation builders.

`env.encode(input).uses(extensionId).process()` resolves `{extensionId}.encode`.

`env.decode(input).uses(extensionId).process()` resolves `{extensionId}.decode`.

If no extension is selected, encode/decode default to the canonical JSON IR.

Format extensions are normal ECP extensions that provide standard `encode` and/or `decode` capabilities. The capability names are reserved conventions when an extension is used through `env.encode()` or `env.decode()`, but they are not globally banned for domain-specific extensions.

Encoding and decoding are explicit utility operations. They are not workflow runs, they do not emit workflow lifecycle events, and they must not mutate workflow state.

The canonical executable source of truth remains the `@executioncontrolprotocol.workflow` JSON manifest. Encoded formats such as TOON and Fluent API source are views, compressed representations, transport formats, or authoring aids.
```

```md
## Required format extensions

The first two format extensions are:

- `@executioncontrolprotocol/format-toon`
- `@executioncontrolprotocol/format-fluent`

`@executioncontrolprotocol/format-toon` provides:

- `@executioncontrolprotocol/format-toon.encode`
- `@executioncontrolprotocol/format-toon.decode`

`@executioncontrolprotocol/format-fluent` provides:

- `@executioncontrolprotocol/format-fluent.encode`

Together they support the round trip:

Fluent API source → @executioncontrolprotocol.workflow manifest → TOON → @executioncontrolprotocol.workflow manifest → Fluent API source.
```
