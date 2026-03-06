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
import _Ajv from "ajv";
import yaml from "js-yaml";

// AJV CJS/ESM interop: the default export may be wrapped in a .default property
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Ajv = (_Ajv as any).default ?? _Ajv;

import type { ECPContext, Executor, Orchestrator } from "./types/index.js";

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
    `\n  Context: ${ctx.metadata.name} v${ctx.metadata.version} (${ctx.apiVersion})`,
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
