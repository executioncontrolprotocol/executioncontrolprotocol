# ECP Operational Instance, Encoding/Decoding, TOON Compaction, and Lightweight Patch Spec

## 1. Updated source-of-truth decisions

| Area                       | Decision                                                                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Operational object         | `environment(...)` creates a builder; `await env.init()` returns an initialized `Ecp` instance.                                              |
| Termination                | Use `ecp.terminate()`, not `ecp.shutdown()` or `env.shutdown()`.                                                                             |
| Workflow execution         | Do **not** add `ecp.run()` in this pass. Keep this spec focused on initialization, encoding, decoding, patching, validation, and compaction. |
| Encode/decode result shape | Avoid nested access like `toon.content` and `decoded.document`. Use a consistent `.result` property.                                         |
| TOON compaction            | Compaction is `ecp.encode(...).uses("@executioncontrolprotocol/format-toon").with({ headers: false, compact: true }).process()`.             |
| Patch semantics            | Patching is JSON-only and canonical. TOON can encode/decode patch objects, but patch application always operates on canonical JSON.          |
| Patch paths                | Use ECP dot/bracket notation with `steps[<id>]`, not labels.                                                                                 |
| Fluent output              | Keep Fluent API clean. Do **not** render IDs in Fluent API output. IDs belong in JSON serializable objects.                                  |
| Format extension           | `@executioncontrolprotocol/format-toon` already exists and must be extended for header config and patch decoding.                            |
| Header config              | Encoders receive a standard options interface with required header config support, plus extensibility via `Record<string, unknown>`.         |
| Lodash                     | Use lodash for lookup, set, and deep merge where appropriate.                                                                                |
| Validation                 | Encode/decode/patch must validate and return validation results on failure.                                                                  |

---

# 2. Final object model

## 2.1 Environment builder

```ts
const env = environment("browser-demo", "Browser Demo")
  .withRuntime(runtime("@executioncontrolprotocol/browser").with({}))
  .withExtensions([
    extension("@executioncontrolprotocol/format-toon").with({}),
    extension("@executioncontrolprotocol/format-fluent").with({}),
    extension("@executioncontrolprotocol/test").with({}),
  ])
  .withPolicies([
    policy("@executioncontrolprotocol/registry-control").with({
      allowedExtensionNamespaces: ["@executioncontrolprotocol/*", "@customer/*"],
      allowDynamicExtensionRegistration: true,
      allowAutoBind: true,
      freezeOn: "environment:beforeRun",
    }),
  ]);

const ecp = await env.init();
```

## 2.2 Ecp instance

The initialized `Ecp` instance owns operational methods:

```ts
interface Ecp {
  id: string;
  label?: string;

  describe(query?: DescribeQuery): Promise<EnvironmentDescriptor>;
  search(query: string, options?: SearchOptions): Promise<SearchResult>;

  encode(input: unknown): EncodeOperationBuilder;
  decode(input: unknown): DecodeOperationBuilder;
  patch<T = unknown>(document: T): PatchOperationBuilder<T>;

  validate(workflow: WorkflowManifest): Promise<ValidationResult>;

  getRegistry(): Registry;

  terminate(): Promise<void>;
}
```

No `ecp.run()` in this plan.

---

# 3. Lifecycle and registry freezing

## 3.1 Lifecycle naming

Use the lifecycle hooks we already defined:

```ts
type EnvironmentLifecycleEvent =
  | "environment:configuring"
  | "environment:ready"
  | "environment:beforeRun"
  | "environment:terminate";
```

I would use `environment:terminate` instead of `environment:shutdown` to align with `ecp.terminate()`.

## 3.2 Init lifecycle

```txt
env.init()
  → environment:configuring
  → bind runtime/extensions/policies
  → attach config resolvers
  → attach registry behavior
  → environment:ready
  → return Ecp
```

## 3.3 Terminate lifecycle

```txt
ecp.terminate()
  → environment:terminate
  → cleanup browser globals, listeners, session config, etc.
```

## 3.4 Registry freeze config

Instead of many booleans, simplify freeze timing with a lifecycle hook name.

```ts
extension("@executioncontrolprotocol/browser-registry").with({
  exposeGlobal: true,
  globalName: "ecp",
  allowRuntimeRegistration: true,
  autoBindRegisteredExtensions: true,
  freezeOn: "environment:beforeRun",
});
```

Supported values:

```ts
type RegistryFreezeHook =
  | "environment:ready"
  | "environment:beforeRun"
  | "manual";
```

For secure static environments:

```ts
freezeOn: "environment:ready"
```

For browser authoring:

```ts
freezeOn: "environment:beforeRun"
```

For manual control:

```ts
freezeOn: "manual"
```

This is cleaner than:

```ts
frozen
freezeOnReady
freezeOnFirstRun
```

---

# 4. Encode/decode result shape

You are right: avoid:

```ts
toon.content
decoded.document
```

Use a common result envelope with `.result`.

## 4.1 Encoded result

```ts
export interface EncodeResult<T = unknown> {
  schema: "@executioncontrolprotocol.encode.result";
  version: EcpVersion;

  success: boolean;

  format: string;
  sourceSchema?: EcpSchema;
  sourceVersion?: EcpVersion;

  result?: T;

  validation?: ValidationResult;
  diagnostics: ValidationIssue[];
}
```

## 4.2 Decode result

```ts
export interface DecodeResult<T = unknown> {
  schema: "@executioncontrolprotocol.decode.result";
  version: EcpVersion;

  success: boolean;

  targetSchema?: EcpSchema;
  targetVersion?: EcpVersion;

  result?: T;

  validation?: ValidationResult;
  diagnostics: ValidationIssue[];
}
```

## 4.3 Usage

```ts
const toon = await ecp
  .encode(manifest)
  .uses("@executioncontrolprotocol/format-toon")
  .to("@executioncontrolprotocol.workflow")
  .with({ headers: false, compact: true })
  .process();

const patch = await ecp
  .decode(agentPatchToon)
  .uses("@executioncontrolprotocol/format-toon")
  .to("@executioncontrolprotocol.patch")
  .process();

if (!patch.success) {
  console.log(patch.validation, patch.diagnostics);
}

const patched = await ecp
  .patch(manifest)
  .with(patch.result)
  .process();

const compact = await ecp
  .encode(patched.result)
  .uses("@executioncontrolprotocol/format-toon")
  .to("@executioncontrolprotocol.workflow")
  .with({ headers: false, compact: true })
  .process();
```

This keeps everything consistent:

```txt
encode result → .result
decode result → .result
patch result  → .result
```

---

# 5. Encode/decode builders

## 5.1 Encode builder

```ts
interface EncodeOperationBuilder {
  uses(extensionId: string): this;

  /**
   * Declares source schema/version.
   * If version is omitted, CURRENT_ECP_VERSION is used.
   */
  to(schema: EcpSchema, version?: EcpVersion): this;

  with(options: EncodeOptions): this;

  process<T = unknown>(): Promise<EncodeResult<T>>;
}
```

## 5.2 Decode builder

```ts
interface DecodeOperationBuilder {
  uses(extensionId: string): this;

  /**
   * Declares target schema/version.
   * If version is omitted, CURRENT_ECP_VERSION is used.
   */
  to(schema: EcpSchema, version?: EcpVersion): this;

  with(options: DecodeOptions): this;

  process<T = unknown>(): Promise<DecodeResult<T>>;
}
```

## 5.3 Standard format options

Encoders should receive a base options interface that always supports headers.

```ts
export interface EcpFormatOptions extends Record<string, unknown> {
  /**
   * Include schema/version headers in encoded output.
   * Default: true.
   */
  headers?: boolean;

  /**
   * Prefer compact output.
   * Default: false.
   */
  compact?: boolean;

  /**
   * Output content shape.
   */
  as?: "object" | "string";
}
```

Decode options:

```ts
export interface EcpDecodeOptions extends Record<string, unknown> {
  /**
   * Fail on invalid syntax or schema mismatch.
   */
  strict?: boolean;

  /**
   * Header expectation.
   * Default: "auto".
   */
  headers?: boolean | "auto";
}
```

Then:

```ts
export interface EcpEncodeInput {
  source: unknown;
  sourceSchema?: EcpSchema;
  sourceVersion?: EcpVersion;
  format?: string;
  options: EcpFormatOptions;
}
```

```ts
export interface EcpDecodeInput {
  input: unknown;
  targetSchema?: EcpSchema;
  targetVersion?: EcpVersion;
  format?: string;
  options: EcpDecodeOptions;
}
```

---

# 6. Validation behavior for encode/decode

Encode/decode should not silently fail.

## 6.1 Encode success

```ts
{
  schema: "@executioncontrolprotocol.encode.result",
  version: "1.0",
  success: true,
  format: "toon",
  sourceSchema: "@executioncontrolprotocol.workflow",
  result: "workflow: ...",
  diagnostics: []
}
```

## 6.2 Encode failure

```ts
{
  schema: "@executioncontrolprotocol.encode.result",
  version: "1.0",
  success: false,
  format: "toon",
  sourceSchema: "@executioncontrolprotocol.workflow",
  validation: {
    valid: false,
    diagnostics: [...]
  },
  diagnostics: [...]
}
```

## 6.3 Decode failure

```ts
{
  schema: "@executioncontrolprotocol.decode.result",
  version: "1.0",
  success: false,
  targetSchema: "@executioncontrolprotocol.patch",
  validation: {
    valid: false,
    diagnostics: [...]
  },
  diagnostics: [...]
}
```

If `.with({ strict: true })` is set, the implementation may throw typed errors. Otherwise, it should return `success: false`.

Recommendation:

```txt
Default: return success false with diagnostics.
Strict: throw typed EcpError with validation attached.
```

---

# 7. Format extension contracts

## 7.1 Reserved capability names

```ts
export const ECP_FORMAT_CAPABILITY_NAMES = {
  ENCODE: "encode",
  DECODE: "decode",
} as const;
```

These are not globally banned. But if an extension is used through `ecp.encode()` or `ecp.decode()`, the capability must exist.

Resolution:

```txt
ecp.encode(...).uses("@executioncontrolprotocol/format-toon")
  → @executioncontrolprotocol/format-toon.encode

ecp.decode(...).uses("@executioncontrolprotocol/format-toon")
  → @executioncontrolprotocol/format-toon.decode
```

## 7.2 Capability contract

```ts
@executioncontrolprotocol/format-toon.encode
input: EcpEncodeInput
output: EncodeResult

@executioncontrolprotocol/format-toon.decode
input: EcpDecodeInput
output: DecodeResult
```

---

# 8. `@executioncontrolprotocol/format-toon`

`@executioncontrolprotocol/format-toon` already exists. Extend it.

## 8.1 Must support

| Document                                         | Encode             | Decode             |
| ------------------------------------------------ | ------------------ | ------------------ |
| `@executioncontrolprotocol.workflow`             | Yes                | Yes                |
| `@executioncontrolprotocol.patch`                | Yes                | Yes                |
| `@executioncontrolprotocol.environment.describe` | Later / optional   | Later / optional   |
| `@executioncontrolprotocol.validation.result`    | Later / optional   | Later / optional   |

## 8.2 Header config

Headered output:

```txt
schema: @executioncontrolprotocol.workflow
version: 1.0
workflow: weekly-brief "Weekly Brief"

step "Collect Signals"
  uses: @executioncontrolprotocol/memory.search
  in:
    query: weekly risks and decisions
  out: signals
```

Headerless output:

```txt
workflow: weekly-brief "Weekly Brief"

step "Collect Signals"
  uses: @executioncontrolprotocol/memory.search
  in:
    query: weekly risks and decisions
  out: signals
```

Usage:

```ts
const toon = await ecp
  .encode(manifest)
  .uses("@executioncontrolprotocol/format-toon")
  .to("@executioncontrolprotocol.workflow")
  .with({ headers: false, compact: true })
  .process();
```

## 8.3 Decode headerless patch

```ts
const patch = await ecp
  .decode(headerlessPatchToon)
  .uses("@executioncontrolprotocol/format-toon")
  .to("@executioncontrolprotocol.patch")
  .process();
```

Because headerless content is not self-describing, `.to("@executioncontrolprotocol.patch")` should be used.

---

# 9. Fluent API alignment

## 9.1 Keep Fluent clean

Do **not** render IDs in generated Fluent API.

Avoid:

```ts
step("@executioncontrolprotocol/openai.generate", "Write Brief")
  .id("write-brief")
```

Prefer:

```ts
step("@executioncontrolprotocol/openai.generate", "Write Brief")
  .with({
    prompt: "Create a concise brief",
    context: ref("signals.results"),
  })
  .as("brief")
```

## 9.2 IDs belong in JSON serializable objects

When Fluent compiles to JSON manifest, the manifest can include IDs:

```json
{
  "id": "write-brief",
  "label": "Write Brief",
  "uses": "@executioncontrolprotocol/openai.generate",
  "input": {
    "prompt": "Create a concise brief"
  },
  "commitAs": "brief"
}
```

The generated IDs can be:

```txt
- deterministic slugs from labels
- or compiler-generated stable IDs
```

But they should not clutter Fluent API output.

## 9.3 Why this matters

If an LLM edits Fluent API, it can edit the code directly.

If an LLM patches JSON, it uses stable JSON node IDs.

These are separate editing modes:

| Editing mode               | Target                                              |
| -------------------------- | --------------------------------------------------- |
| Developer / code agent     | Fluent API source                                   |
| Browser compact patch loop | JSON manifest + `@executioncontrolprotocol.patch`   |
| Small LLM repair           | TOON-encoded patch → JSON patch                     |

---

# 10. Patch schema

Keep patch lightweight.

## 10.1 Canonical patch document

```ts
export interface EcpPatchDocument {
  schema: "@executioncontrolprotocol.patch";
  version: EcpVersion;
  targetSchema: EcpSchema;
  patches: EcpPatchEntry[];
}
```

```ts
export interface EcpPatchEntry {
  /**
   * ECP JSON dot path.
   * Uses step IDs, not labels.
   */
  path: string;

  /**
   * Defaults to "merge".
   */
  mode?: "merge" | "replace";

  /**
   * Partial or full JSON value.
   */
  value: unknown;

  reason?: string;
}
```

No `format`.

No `op`.

## 10.2 Shorthand patch input

```ts
export type EcpPatchInput =
  | EcpPatchDocument
  | EcpPatchEntry[]
  | Record<string, unknown>;
```

Example:

```ts
const patched = await ecp
  .patch(manifest)
  .with({
    "steps[write-brief].input": {
      prompt: "Create a concise executive brief.",
    },
  })
  .process();
```

Equivalent canonical patch:

```json
{
  "schema": "@executioncontrolprotocol.patch",
  "version": "1.0",
  "targetSchema": "@executioncontrolprotocol.workflow",
  "patches": [
    {
      "path": "steps[write-brief].input",
      "mode": "merge",
      "value": {
        "prompt": "Create a concise executive brief."
      }
    }
  ]
}
```

---

# 11. Patch path convention

Use `steps[<id>]`, not `nodes[<id>]`.

You called this out correctly: keep JSON and Fluent concepts aligned around steps.

## 11.1 Supported path roots

Required v1:

```txt
workflow.<property>
steps[<stepId>].<property>
```

Examples:

```txt
workflow.label
workflow.id
steps[write-brief].uses
steps[write-brief].input
steps[write-brief].input.prompt
steps[write-brief].input.options.maxWords
steps[write-brief].commitAs
steps[write-brief].when
```

Optional later:

```txt
steps[3].input.prompt
```

But ID-based paths should be preferred.

## 11.2 IDs, not names

Do not use labels or names for patch identity.

Bad:

```txt
steps[Write Brief].input.prompt
```

Good:

```txt
steps[write-brief].input.prompt
```

Validation rule:

```txt
All JSON workflow step IDs must be unique across the full workflow graph.
```

If duplicate IDs exist, patching fails with:

```txt
DUPLICATE_STEP_ID
```

## 11.3 Nested steps

Even if a step is inside a loop or branch, its ID must be unique and addressable by:

```txt
steps[step-id]
```

The resolver should build a step ID index by walking the full workflow graph recursively.

---

# 12. Lodash for patch lookups and deep merge

Use lodash for:

```txt
get
set
merge
cloneDeep
```

Imports:

```ts
import get from "lodash/get";
import set from "lodash/set";
import merge from "lodash/merge";
import cloneDeep from "lodash/cloneDeep";
```

## 12.1 Path resolution

ECP path:

```txt
steps[write-brief].input.prompt
```

resolves to lodash path:

```txt
steps[1].input.prompt
```

or nested equivalent:

```txt
steps[2].steps[0].input.prompt
```

Implementation:

```ts
function resolveEcpPatchPath(
  document: WorkflowManifest,
  path: string
): ResolvedPatchPath {
  if (path.startsWith("workflow.")) {
    return {
      ok: true,
      lodashPath: path,
    };
  }

  const stepMatch = path.match(/^steps\[([^\]]+)\](?:\.(.*))?$/);

  if (stepMatch) {
    const stepId = stepMatch[1];
    const rest = stepMatch[2];

    const index = buildStepIndex(document);

    if (index.duplicates.includes(stepId)) {
      return {
        ok: false,
        code: "DUPLICATE_STEP_ID",
        message: `Duplicate step id: ${stepId}`,
      };
    }

    const stepPath = index.pathsById.get(stepId);

    if (!stepPath) {
      return {
        ok: false,
        code: "PATCH_PATH_NOT_FOUND",
        message: `Step not found: ${stepId}`,
      };
    }

    return {
      ok: true,
      lodashPath: rest ? `${stepPath}.${rest}` : stepPath,
    };
  }

  return {
    ok: false,
    code: "PATCH_PATH_UNSUPPORTED",
    message: `Unsupported patch path: ${path}`,
  };
}
```

## 12.2 Merge/replace

```ts
const currentValue = get(nextDocument, resolved.lodashPath);

const nextValue =
  entry.mode === "replace"
    ? entry.value
    : merge(cloneDeep(currentValue), entry.value);

set(nextDocument, resolved.lodashPath, nextValue);
```

Default mode:

```txt
merge
```

Merge preserves omitted fields.

Replace replaces full selected value.

---

# 13. Patch result shape

Use `.result` consistently.

```ts
export interface PatchResult<T = unknown> {
  schema: "@executioncontrolprotocol.patch.result";
  version: EcpVersion;

  success: boolean;

  targetSchema: EcpSchema;
  targetVersion?: EcpVersion;

  result?: T;

  patch?: EcpPatchDocument;

  applied: AppliedPatchEntry[];

  validation?: ValidationResult;

  diagnostics: ValidationIssue[];
}
```

```ts
export interface AppliedPatchEntry {
  path: string;
  mode: "merge" | "replace";
  success: boolean;
  diagnostics?: ValidationIssue[];
}
```

Usage:

```ts
const patched = await ecp
  .patch(manifest)
  .with({
    "steps[write-brief].input": {
      prompt: "Create a concise executive brief.",
    },
  })
  .process();

if (patched.success) {
  const updatedManifest = patched.result;
}
```

---

# 14. Patch builder

```ts
export interface PatchOperationBuilder<T = unknown> {
  with(input: EcpPatchInput): this;
  process(): Promise<PatchResult<T>>;
}
```

No `.uses(...)` on patch for v1.

Reason:

```txt
patching is JSON-only
decode handles representation
patch handles canonical JSON
encode handles compaction after patch
```

Correct flow:

```ts
const patch = await ecp
  .decode(agentPatchToon)
  .uses("@executioncontrolprotocol/format-toon")
  .to("@executioncontrolprotocol.patch")
  .process();

const patched = await ecp
  .patch(manifest)
  .with(patch.result)
  .process();

const compact = await ecp
  .encode(patched.result)
  .uses("@executioncontrolprotocol/format-toon")
  .to("@executioncontrolprotocol.workflow")
  .with({ headers: false, compact: true })
  .process();
```

---

# 15. Agent task plan

## Task 1: Add `Ecp` operational instance

Implement:

```txt
EnvironmentBuilder.init()
Ecp interface
Ecp implementation
ecp.terminate()
```

Acceptance criteria:

* `const ecp = await env.init()` works.
* Operational methods live on `ecp`.
* `ecp.terminate()` fires `environment:terminate`.
* Existing environment builder remains declarative.

---

## Task 2: Lifecycle update

Implement:

```txt
environment:configuring
environment:ready
environment:beforeRun
environment:terminate
```

Acceptance criteria:

* `environment:configuring` and `environment:ready` fire during `env.init()`.
* `environment:terminate` fires during `ecp.terminate()`.
* Registry extension can freeze on configured lifecycle hook.

---

## Task 3: Registry freeze config

Update browser registry extension config:

```ts
{
  freezeOn?: "environment:ready" | "environment:beforeRun" | "manual";
}
```

Acceptance criteria:

* `freezeOn: "environment:ready"` freezes during init.
* `freezeOn: "environment:beforeRun"` freezes before execution lifecycle.
* `freezeOn: "manual"` does not auto-freeze.
* Namespace authorization remains policy-governed.

---

## Task 4: Add encode/decode result types

Implement:

```txt
EncodeResult
DecodeResult
EcpEncodeInput
EcpDecodeInput
EcpFormatOptions
EcpDecodeOptions
```

Acceptance criteria:

* All results use `.result`.
* Failures include `success: false`, `validation`, and `diagnostics`.

---

## Task 5: Add encode/decode builders to Ecp

Implement:

```txt
ecp.encode(input)
ecp.decode(input)
.uses(...)
.to(schema, version?)
.with(options)
.process()
```

Acceptance criteria:

* JSON default works without extension.
* Extension-backed encode/decode resolves `{extensionId}.encode/decode`.
* Missing extension/capability returns failure or throws in strict mode.
* Encode/decode do not emit run/step lifecycle events.

---

## Task 6: Add validation to encode/decode

Implement validation before/after format processing.

Acceptance criteria:

* Invalid source manifests return `success: false`.
* Invalid decoded documents return `success: false`.
* `strict: true` throws typed errors with validation attached.
* Non-strict mode returns validation details.

---

## Task 7: Update `@executioncontrolprotocol/format-toon`

Extend existing package.

Implement:

```txt
headers option
compact option
workflow encode/decode
patch encode/decode
result shape compatibility
```

Acceptance criteria:

* Headered TOON works.
* Headerless TOON works.
* Headerless workflow decode works when `.to("@executioncontrolprotocol.workflow")` is supplied.
* Headerless patch decode works when `.to("@executioncontrolprotocol.patch")` is supplied.
* Decode failures include diagnostics.

---

## Task 8: Add `@executioncontrolprotocol/format-fluent`

Implement manifest → Fluent source.

Rules:

```txt
Do not render .id(...)
Keep Fluent API clean
IDs are generated/preserved in JSON manifest only
```

Acceptance criteria:

* Manifest encodes to Fluent API source.
* Generated source compiles back to equivalent manifest.
* No `.id(...)` is emitted.
* Refs render as `ref(...)`.
* State handles render as `state(...)`.
* Conditions render as `expr.eq(...)` / `expr.neq(...)`.

---

## Task 9: Add patch types

Implement:

```txt
EcpPatchDocument
EcpPatchEntry
EcpPatchInput
PatchResult
AppliedPatchEntry
```

Acceptance criteria:

* Canonical patch schema validates.
* Shorthand object patches normalize into canonical patch documents.

---

## Task 10: Add patch builder to Ecp

Implement:

```txt
ecp.patch(document).with(input).process()
```

Acceptance criteria:

* Accepts canonical patch document.
* Accepts patch entry array.
* Accepts shorthand object.
* Returns `PatchResult` with `.result`.
* Does not patch TOON directly.

---

## Task 11: Implement ECP patch path resolver

Support:

```txt
workflow.<property>
steps[<stepId>].<property>
```

Acceptance criteria:

* Step IDs are used, not labels.
* Nested steps are discoverable.
* Duplicate IDs fail patching.
* Missing step IDs return diagnostics.
* Unsupported path syntax returns diagnostics.

---

## Task 12: Use lodash for patching

Use:

```txt
lodash/get
lodash/set
lodash/merge
lodash/cloneDeep
```

Acceptance criteria:

* Lookups use resolved lodash-compatible paths.
* Merge is deep.
* Replace is full replacement.
* Original document is not mutated.

---

## Task 13: Validate patched document

After patching:

```txt
run full Zod/schema validation
```

Acceptance criteria:

* Invalid patched workflow returns `success: false`.
* Validation diagnostics are included.
* Attempted patched document may still be returned in `.result` for repair loops.

---

## Task 14: Full compaction loop test

Test:

```txt
Fluent → JSON → TOON → patch TOON → patch JSON → patched JSON → TOON → Fluent
```

Acceptance criteria:

* No nested `.content` / `.document` access in test code.
* Use `.result` everywhere.
* Final generated Fluent compiles.
* Final manifest validates.

---

# 16. Required tests

## 16.1 `env.init()` returns `Ecp`

```ts
it("initializes an Ecp operational instance", async () => {
  const env = environment("test");
  const ecp = await env.init();

  expect(ecp.encode).toBeTypeOf("function");
  expect(ecp.decode).toBeTypeOf("function");
  expect(ecp.patch).toBeTypeOf("function");
  expect(ecp.terminate).toBeTypeOf("function");
});
```

## 16.2 Encode uses `.result`

```ts
it("encodes TOON and returns result directly", async () => {
  const encoded = await ecp
    .encode(manifest)
    .uses("@executioncontrolprotocol/format-toon")
    .to("@executioncontrolprotocol.workflow")
    .with({ headers: false, compact: true })
    .process();

  expect(encoded.success).toBe(true);
  expect(typeof encoded.result).toBe("string");
});
```

## 16.3 Decode uses `.result`

```ts
it("decodes TOON and returns result directly", async () => {
  const decoded = await ecp
    .decode(toon)
    .uses("@executioncontrolprotocol/format-toon")
    .to("@executioncontrolprotocol.workflow")
    .process();

  expect(decoded.success).toBe(true);
  expect(decoded.result.schema).toBe("@executioncontrolprotocol.workflow");
});
```

## 16.4 Headerless TOON

```ts
it("supports headerless compact TOON", async () => {
  const encoded = await ecp
    .encode(manifest)
    .uses("@executioncontrolprotocol/format-toon")
    .to("@executioncontrolprotocol.workflow")
    .with({ headers: false, compact: true })
    .process();

  expect(encoded.result).not.toContain("schema:");
  expect(encoded.result).not.toContain("version:");
});
```

## 16.5 Patch shorthand

```ts
it("applies shorthand patch using step ID path", async () => {
  const patched = await ecp
    .patch(manifest)
    .with({
      "steps[write-brief].input": {
        prompt: "Create a concise executive brief.",
      },
    })
    .process();

  expect(patched.success).toBe(true);
  expect(patched.result.steps[1].input.prompt)
    .toBe("Create a concise executive brief.");
});
```

## 16.6 Deep merge preserves omitted fields

```ts
it("deep merges by default", async () => {
  const patched = await ecp
    .patch(manifest)
    .with({
      "steps[write-brief].input.options": {
        tone: "executive",
      },
    })
    .process();

  expect(patched.result.steps[1].input.options.tone).toBe("executive");
  expect(patched.result.steps[1].input.options.maxWords).toBe(100);
});
```

## 16.7 Replace mode

```ts
it("replaces selected value when mode is replace", async () => {
  const patched = await ecp
    .patch(manifest)
    .with([
      {
        path: "steps[write-brief].input",
        mode: "replace",
        value: {
          prompt: "Only this remains.",
        },
      },
    ])
    .process();

  expect(patched.result.steps[1].input).toEqual({
    prompt: "Only this remains.",
  });
});
```

## 16.8 Duplicate step ID

```ts
it("fails patching when duplicate step ids exist", async () => {
  const patched = await ecp
    .patch(duplicateIdManifest)
    .with({
      "steps[write-brief].input": {
        prompt: "New prompt",
      },
    })
    .process();

  expect(patched.success).toBe(false);
  expect(
    patched.diagnostics.some(d => d.code === "DUPLICATE_STEP_ID")
  ).toBe(true);
});
```

## 16.9 Decode validation failure

```ts
it("returns validation diagnostics when decode fails", async () => {
  const decoded = await ecp
    .decode(invalidToon)
    .uses("@executioncontrolprotocol/format-toon")
    .to("@executioncontrolprotocol.workflow")
    .process();

  expect(decoded.success).toBe(false);
  expect(decoded.validation?.valid).toBe(false);
  expect(decoded.diagnostics.length).toBeGreaterThan(0);
});
```

---

# 17. Final source-of-truth summary

```txt
environment(...) creates a declarative environment builder.

env.init() initializes the environment and returns Ecp.

ecp.terminate() terminates the initialized environment.

Operational methods live on Ecp:
describe, search, encode, decode, patch, validate, terminate.

No ecp.run in this implementation pass.

Encoding/decoding are utility builders:
ecp.encode(input).uses(extension).to(schema, version?).with(options).process()
ecp.decode(input).uses(extension).to(schema, version?).with(options).process()

All encode/decode/patch results use .result.

Encoders must support header config:
headers true/false
compact true/false

Compaction is encoding with:
{ headers: false, compact: true }

Patching is canonical JSON only.

TOON can represent a patch, but must be decoded into @executioncontrolprotocol.patch before application.

Patch entries have:
path
mode?: merge | replace
value
reason?

No op property.
No format property.

Patch paths use:
workflow.<property>
steps[<stepId>].<property>

Step IDs, not labels, are the stable patch target.

Fluent API output should not render IDs.
IDs exist in JSON serializable manifests.

Use lodash internally for:
get
set
merge
cloneDeep

Patch validation returns:
success
result
patch
applied
validation
diagnostics
```

This is the version I’d move forward with for implementation.
