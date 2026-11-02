#!/usr/bin/env node

import { execute } from "@oclif/core"
import { applyDefaultEcpHome } from "../dist/lib/ecp-home.js"
import { prepareArgvForExecute } from "../dist/lib/add-to-env.js"

process.noDeprecation = true

applyDefaultEcpHome()
process.argv = prepareArgvForExecute(process.argv)

await execute({ development: true, dir: import.meta.url })
