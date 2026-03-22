#!/usr/bin/env tsx
/**
 * ECP Context Spec Validator
 *
 * Loads spec.yaml, validates it against the ECP JSON Schema using AJV,
 * and performs additional structural checks (e.g. entrypoint references
 * a real executor, outputSchemaRef points to a declared schema, etc.).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";

import { Ajv } from "./ajv.js";

import type {
  ECPContext,
  Executor,
  Orchestrator,
  PluginReference,
  ExtensionSourceType,
} from "./types/index.js";
import { getContextPlugins } from "./types/index.js";

const SCHEMA_PATH = resolve(import.meta.dirname, "../dist/ecp-context.schema.json");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadYaml(filePath: string): unknown {
  const raw = readFileSync(filePath, "utf-8");
  return yaml.load(raw);
}

function fail(message: string): never {
  console.error(`  FAIL: ${message}`);
  process.exit(1);
}

function pass(message: string): void {
  console.log(`  PASS: ${message}`);
}

type ExecutionObject = Executor | Orchestrator;

function schemaNameFromRef(ref: string): string {
  return ref.replace(/^#\/schemas\//, "");
}

function isModelProviderReference(
  provider: unknown,
): provider is { name: string; type: ExtensionSourceType; version: string } {
  if (!provider || typeof provider !== "object") return false;
  const candidate = provider as Record<string, unknown>;
  return (
    typeof candidate.name === "string" &&
    typeof candidate.type === "string" &&
    typeof candidate.version === "string"
  );
}

function collectDeclaredPlugins(ctx: ECPContext): PluginReference[] {
  const p = getContextPlugins(ctx);
  if (!p) return [];
  return [...(p.providers ?? []), ...(p.executors ?? []), ...(p.entries ?? [])];
}

function collectExecutionObjects(ctx: ECPContext): {
  entrypointName?: string;
  objects: ExecutionObject[];
} {
  const objects: ExecutionObject[] = [];

  const visitOrchestrator = (orchestrator: Orchestrator): void => {
    objects.push(orchestrator);
    for (const executor of orchestrator.executors ?? []) {
      objects.push(executor);
    }
    for (const child of orchestrator.orchestrators ?? []) {
      visitOrchestrator(child);
    }
  };

  if (ctx.orchestrator) {
    visitOrchestrator(ctx.orchestrator);
  }

  for (const executor of ctx.executors ?? []) {
    objects.push(executor);
  }

  const entrypointName = ctx.orchestrator?.name ?? ctx.orchestration?.entrypoint;
  return { entrypointName, objects };
}

// ---------------------------------------------------------------------------
// Schema validation via AJV
// ---------------------------------------------------------------------------

function validateSchema(doc: unknown): ECPContext {
  if (!existsSync(SCHEMA_PATH)) {
    fail(
      `Generated schema not found at ${SCHEMA_PATH}. Run "npm run generate:schema" first.`,
    );
  }

  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf-8"));
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);

  if (!validate(doc)) {
    console.error("\nSchema validation errors:");
    for (const err of validate.errors ?? []) {
      console.error(`  - ${err.instancePath || "/"}: ${err.message}`);
    }
    fail("spec.yaml does not conform to the ECP Context schema.");
  }

  return doc as ECPContext;
}

// ---------------------------------------------------------------------------
// Structural checks beyond JSON Schema
// ---------------------------------------------------------------------------

function checkStructure(ctx: ECPContext): void {
  const { entrypointName, objects } = collectExecutionObjects(ctx);
  const executorNames = new Set(objects.map((e) => e.name));
  const schemaNames = new Set(Object.keys(ctx.schemas ?? {}));
  const declaredPlugins = collectDeclaredPlugins(ctx);
  const declaredPluginNames = new Set(declaredPlugins.map((ext) => ext.name));

  if (objects.length === 0) {
    fail("Context must define at least one execution object (orchestrator/executor).");
  }
  pass(`Context defines ${objects.length} execution object(s).`);

  const strategy = ctx.orchestration?.strategy ?? ctx.orchestrator?.strategy;
  if (!strategy) {
    fail(
      "Missing orchestration strategy. Set orchestration.strategy or orchestrator.strategy.",
    );
  }
  pass(`Execution strategy "${strategy}" is defined.`);

  // Entrypoint must resolve to an existing execution object
  if (!entrypointName) {
    fail(
      "Missing entrypoint. Set either orchestrator.name (preferred) or orchestration.entrypoint.",
    );
  }
  if (!executorNames.has(entrypointName)) {
    fail(`entrypoint "${entrypointName}" does not match any execution object name.`);
  }
  pass(`entrypoint "${entrypointName}" references a valid execution object.`);

  // orchestration.requires must reference declared schemas
  const requiredSchemas = ctx.orchestration?.requires ?? [];
  for (const req of requiredSchemas) {
    if (!schemaNames.has(req)) {
      fail(`orchestration.requires "${req}" is not declared in schemas.`);
    }
  }
  if (requiredSchemas.length > 0) {
    pass(
      `orchestration.requires [${requiredSchemas.join(", ")}] all reference declared schemas.`,
    );
  }

  // orchestration.produces must reference a declared schema
  const producedSchema = ctx.orchestration?.produces;
  if (producedSchema && !schemaNames.has(producedSchema)) {
    fail(
      `orchestration.produces "${producedSchema}" is not declared in schemas.`,
    );
  }
  if (producedSchema) {
    pass(
      `orchestration.produces "${producedSchema}" references a declared schema.`,
    );
  }

  // Execution object schema refs must reference declared schemas
  for (const executor of objects) {
    if (executor.inputSchemaRef) {
      const ref = schemaNameFromRef(executor.inputSchemaRef);
      if (!schemaNames.has(ref)) {
        fail(
          `execution object "${executor.name}" inputSchemaRef "${executor.inputSchemaRef}" does not match a declared schema.`,
        );
      }
      pass(
        `execution object "${executor.name}" inputSchemaRef "${executor.inputSchemaRef}" is valid.`,
      );
    }

    if (executor.outputSchemaRef) {
      const ref = schemaNameFromRef(executor.outputSchemaRef);
      if (!schemaNames.has(ref)) {
        fail(
          `execution object "${executor.name}" outputSchemaRef "${executor.outputSchemaRef}" does not match a declared schema.`,
        );
      }
      pass(
        `execution object "${executor.name}" outputSchemaRef "${executor.outputSchemaRef}" is valid.`,
      );
    }
  }

  // Execution object names must be unique
  if (executorNames.size !== objects.length) {
    fail("Duplicate execution object names detected.");
  }
  pass(`All ${objects.length} execution object names are unique.`);

  // Budget values must be >= 1 when specified
  for (const obj of objects) {
    const budgets = obj.policies?.budgets;
    if (!budgets) continue;

    if (budgets.maxToolCalls !== undefined && budgets.maxToolCalls < 1) {
      fail(
        `execution object "${obj.name}" has maxToolCalls=${budgets.maxToolCalls}; budget values must be >= 1.`,
      );
    }
    if (budgets.maxRuntimeSeconds !== undefined && budgets.maxRuntimeSeconds < 1) {
      fail(
        `execution object "${obj.name}" has maxRuntimeSeconds=${budgets.maxRuntimeSeconds}; budget values must be >= 1.`,
      );
    }
  }
  pass("All budget values are >= 1.");

  // Plugin declarations and security consistency
  const pluginsBlock = getContextPlugins(ctx);
  if (pluginsBlock) {
    if ((pluginsBlock as unknown as Record<string, unknown>).enable !== undefined) {
      fail(
        "plugins.enable is not allowed in Context manifests. Plugin enable list is runtime-only (use CLI --enable or system config defaultEnable).",
      );
    }
    if (declaredPlugins.length > 0 && declaredPluginNames.size !== declaredPlugins.length) {
      fail("Duplicate plugin IDs detected in plugins.providers/executors/entries.");
    }

    const providerKindMismatch = (pluginsBlock.providers ?? []).find((ext) => ext.kind !== "provider");
    if (providerKindMismatch) {
      fail(
        `plugins.providers entry "${providerKindMismatch.name}" must declare kind "provider".`,
      );
    }

    const executorKindMismatch = (pluginsBlock.executors ?? []).find((ext) => ext.kind !== "executor");
    if (executorKindMismatch) {
      fail(
        `plugins.executors entry "${executorKindMismatch.name}" must declare kind "executor".`,
      );
    }

    const entryKindMismatch = (pluginsBlock.entries ?? []).find(
      (ext) => ext.kind === "provider" || ext.kind === "executor",
    );
    if (entryKindMismatch) {
      fail(
        `plugins.entries entry "${entryKindMismatch.name}" must not use kind "provider" or "executor" (use providers / executors instead).`,
      );
    }

    pass(`Context declares ${declaredPlugins.length} unique plugin reference(s).`);
  }

  // Output fromSchema must reference a declared schema
  for (const output of ctx.outputs ?? []) {
    if (!output.fromSchema && !output.schema) {
      fail(
        `output "${output.name}" must declare either fromSchema or inline schema.`,
      );
    }
    if (output.fromSchema && !schemaNames.has(output.fromSchema)) {
      fail(
        `output "${output.name}" fromSchema "${output.fromSchema}" is not declared in schemas.`,
      );
    }
    if (output.fromSchema) {
      pass(`output "${output.name}" fromSchema "${output.fromSchema}" is valid.`);
    } else {
      pass(`output "${output.name}" inline schema is valid.`);
    }
  }

  // Model provider extension refs must resolve to declared providers (when structured refs are used)
  const providerExtensions = new Set((getContextPlugins(ctx)?.providers ?? []).map((ext) => ext.name));
  for (const executor of objects) {
    const provider = executor.model?.provider;
    if (!isModelProviderReference(provider)) continue;

    if (providerExtensions.size > 0 && !providerExtensions.has(provider.name)) {
      fail(
        `execution object "${executor.name}" references provider "${provider.name}" but it is not declared in plugins.providers.`,
      );
    }

    const allowedKinds = new Set(getContextPlugins(ctx)?.security?.allowKinds ?? []);
    if (allowedKinds.size > 0 && !allowedKinds.has("provider")) {
      fail(
        `execution object "${executor.name}" uses a model provider but plugins.security.allowKinds does not allow "provider".`,
      );
    }

    const allowedSourceTypes = new Set(
      getContextPlugins(ctx)?.security?.allowSourceTypes ?? ["builtin"],
    );
    if (allowedSourceTypes.size > 0 && !allowedSourceTypes.has(provider.type)) {
      fail(
        `execution object "${executor.name}" uses provider type "${provider.type}" which is not allowed by plugins.security.allowSourceTypes.`,
      );
    }

    const denied = new Set(getContextPlugins(ctx)?.security?.denyIds ?? []);
    if (denied.has(provider.name)) {
      fail(
        `execution object "${executor.name}" uses provider "${provider.name}" but it is denied by plugins.security.denyIds.`,
      );
    }

    pass(
      `execution object "${executor.name}" provider reference "${provider.name}" is structurally valid.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const repoRoot = resolve(import.meta.dirname, "../../..");
  const specPath = resolve(repoRoot, "spec.yaml");

  console.log(`\nValidating: ${specPath}\n`);
  console.log("--- Schema Validation (AJV) ---");

  const doc = loadYaml(specPath);
  const ctx = validateSchema(doc);
  pass("spec.yaml conforms to the ECP Context JSON Schema.\n");

  console.log("--- Structural Checks ---");
  checkStructure(ctx);

  console.log(
    `\n  Context: ${ctx.metadata.name} v${ctx.metadata.version} (${ctx.specVersion})`,
  );
  const { objects } = collectExecutionObjects(ctx);
  console.log(`  Execution objects: ${objects.map((e) => e.name).join(", ")}`);
  console.log(`  Schemas: ${Object.keys(ctx.schemas ?? {}).join(", ")}`);
  console.log(
    `  Strategy: ${ctx.orchestration?.strategy ?? ctx.orchestrator?.strategy ?? "unknown"}`,
  );
  console.log("\nAll checks passed.\n");
}

main();
