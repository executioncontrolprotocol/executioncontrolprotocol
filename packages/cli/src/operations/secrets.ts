import { z } from "zod"
import { createInterface } from "node:readline/promises"
import { stdin, stdout } from "node:process"
import {
  canonicalSecretKey,
  ECP_SECRET_REF_PROTOCOL_PREFIX,
  redactSecret,
  secretRefIdFromLogicalKey,
} from "@executioncontrolprotocol/node"
import { defineOperation, EcpCliError, EXIT_FAILED } from "@executioncontrolprotocol/plugin-sdk"
import { getCliSecretsStore } from "../lib/secrets/store.js"

async function requireStore() {
  const store = getCliSecretsStore()
  if (!(await store.isAvailable())) {
    throw new EcpCliError("ECP_SECRETS_UNAVAILABLE", "OS keychain is not available on this system.", {
      exitCode: EXIT_FAILED,
    })
  }
  return store
}

/** `ecp config secrets` topic help. @category CLI */
export const configSecretsOperation = defineOperation("config:secrets")
  .withInput(z.object({}))
  .withMetadata({
    summary: "Manage OS keychain secrets",
    description: `Store and inspect secret values in the OS keychain (outside config files).

Subcommands: add, get, remove, list. Ref ids use ${ECP_SECRET_REF_PROTOCOL_PREFIX}<key>.`,
    useCases: ["Keep API keys out of workflow files"],
    examples: [
      "ecp config secrets add server/fetch.token",
      "ecp config secrets get server/fetch.token",
      "ecp config secrets list",
    ],
  })
  .withHandler(async () =>
    [
      "Usage: ecp config secrets <subcommand>",
      "",
      "  add KEY   Add or replace a secret (interactive paste; use --value for inline)",
      "  get KEY   Read a secret (default: redacted preview; use --reveal for full value)",
      "  remove KEY  Remove a stored secret",
      "  list      List keys",
      "",
      `Ref ids use the form ${ECP_SECRET_REF_PROTOCOL_PREFIX}<key>.`,
      "Run ecp config secrets <cmd> --help for flags.",
    ].join("\n")
  )
  .build()

/** `ecp config secrets add`. @category CLI */
export const configSecretsAddOperation = defineOperation("config:secrets:add")
  .withInput(z.object({ key: z.string(), value: z.string().optional() }))
  .withMetadata({
    summary: "Add or replace a secret in the OS keychain",
    description:
      "Prompts interactively for the secret value by default. Use --value for non-interactive inline input.",
    useCases: ["Store a provider token for workflow secrets() refs"],
    examples: ["ecp config secrets add server/fetch.token", "ecp config secrets add GITHUB_API_KEY --value ghp_xxx"],
    cli: { args: ["key"] },
  })
  .withHandler(async (input) => {
    const store = await requireStore()
    let value = input.value ? String(input.value) : undefined
    if (value === undefined) {
      if (!process.stdin.isTTY) {
        throw new EcpCliError("ECP_INPUT_INVALID", "Secret value cannot be empty. Pass --value.", {
          exitCode: 2,
        })
      }
      const rl = createInterface({ input: stdin, output: stdout })
      try {
        value = (await rl.question("Paste secret value: ")).trim()
      } finally {
        rl.close()
      }
      if (!value) {
        throw new EcpCliError("ECP_INPUT_INVALID", "Secret value cannot be empty.", { exitCode: 2 })
      }
    }
    const key = canonicalSecretKey(String(input.key))
    await store.set(key, value)
    return `Stored secret "${key}" (${secretRefIdFromLogicalKey(key)}).`
  })
  .build()

/** `ecp config secrets get`. @category CLI */
export const configSecretsGetOperation = defineOperation("config:secrets:get")
  .withInput(z.object({ key: z.string(), reveal: z.boolean().optional() }))
  .withMetadata({
    summary: "Read a secret (redacted by default)",
    description: "Print a redacted preview, or the full value with --reveal.",
    useCases: ["Confirm a secret is stored"],
    examples: ["ecp config secrets get server/fetch.token"],
    cli: { args: ["key"] },
  })
  .withHandler(async (input) => {
    const store = await requireStore()
    const key = canonicalSecretKey(String(input.key))
    const value = await store.get(key)
    if (value == null) {
      throw new EcpCliError("ECP_SECRETS_MISSING", `No secret for key "${key}".`, { exitCode: EXIT_FAILED })
    }
    if (input.reveal) return value
    return redactSecret(value)
  })
  .build()

/** `ecp config secrets list`. @category CLI */
export const configSecretsListOperation = defineOperation("config:secrets:list")
  .withInput(z.object({}))
  .withMetadata({
    summary: "List secret keys in the OS keychain",
    description: "Print stored secret keys (not values).",
    useCases: ["See which secrets the CLI can resolve"],
    examples: ["ecp config secrets list"],
  })
  .withHandler(async () => {
    const store = await requireStore()
    const keys = await store.list()
    if (keys.length === 0) return "(no entries)"
    return keys.map((key) => `  ${key}`).join("\n")
  })
  .build()

/** `ecp config secrets remove`. @category CLI */
export const configSecretsRemoveOperation = defineOperation("config:secrets:remove")
  .withInput(z.object({ key: z.string() }))
  .withMetadata({
    summary: "Remove a stored secret from the OS keychain",
    description: "Delete a secret by lookup key.",
    useCases: ["Rotate or drop a stored token"],
    examples: ["ecp config secrets remove server/fetch.token"],
    cli: { args: ["key"] },
  })
  .withHandler(async (input) => {
    const store = await requireStore()
    const key = canonicalSecretKey(String(input.key))
    await store.delete(key)
    return `Removed secret for key "${key}".`
  })
  .build()
