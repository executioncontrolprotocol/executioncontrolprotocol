#!/usr/bin/env node

import { execute } from "@oclif/core"

process.noDeprecation = true

await execute({ development: true, dir: import.meta.url })
