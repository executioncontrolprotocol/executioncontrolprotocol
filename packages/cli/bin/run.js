#!/usr/bin/env node

import {execute} from '@oclif/core'

// Suppress Node deprecation warnings (e.g. punycode -> DEP0040) so CLI output stays clean.
process.noDeprecation = true;

await execute({dir: import.meta.url})
