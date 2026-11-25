#!/usr/bin/env node
import { execute } from "@oclif/core"
import { setupEcpEnv } from "./setup-env.js"

process.noDeprecation = true
setupEcpEnv()
await execute({
  development: true,
  dir: import.meta.url,
  loadOptions: { userPlugins: false },
})
