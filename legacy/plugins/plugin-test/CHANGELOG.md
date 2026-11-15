# @executioncontrolprotocol/plugin-test

## 0.52.0

### Minor Changes

- Field-test bump to 0.52.0. Hoist HTTP request fields to top-level capability parameters so the App and CLI can bind them. Optional `body` shallow-merges underneath those parameters. Async Adobe jobs poll internally and return the inner result document, not status/cancel capabilities or poll knobs. Failed runs and invokes return full execution records (step output, diagnostics, journal identity) on the CLI and in journals.

### Patch Changes

- Updated dependencies
  - @executioncontrolprotocol/core@0.52.0
  - @executioncontrolprotocol/plugin-sdk@0.52.0

## 0.51.0

### Minor Changes

- Regroup the CLI under workflows, environments, runs, plugins, and config topics. Default the global home to ~/.ecp and drop local update, rollback, and autocomplete.
- 0e15667: Move test.echo and the other `@executioncontrolprotocol/test` stubs off the Node default host into `@executioncontrolprotocol/plugin-test`.

### Patch Changes

- Updated dependencies
- Updated dependencies [d18fee4]
- Updated dependencies [0e15667]
  - @executioncontrolprotocol/core@0.51.0
  - @executioncontrolprotocol/plugin-sdk@0.51.0
