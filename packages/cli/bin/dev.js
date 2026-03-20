#!/usr/bin/env -S node --loader ts-node/esm --disable-warning=ExperimentalWarning

import {execute} from '@oclif/core'

// Suppress Node deprecation warnings (e.g. punycode -> DEP0040) so CLI output stays clean.
process.noDeprecation = true;

await execute({development: true, dir: import.meta.url})
