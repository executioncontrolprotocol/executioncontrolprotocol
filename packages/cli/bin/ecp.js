#!/usr/bin/env node

import { execute } from "@oclif/core"

process.noDeprecation = true

await execute({ dir: import.meta.url })
