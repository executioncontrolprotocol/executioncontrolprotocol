---
"@executioncontrolprotocol/cli": minor
---

- **@executioncontrolprotocol/cli** — `ecp plugins install` (alias `add`), `link`, `uninstall` (aliases `unlink`, `remove`), `update` and `reset` are ECP commands: help written for ECP plugins, the `{ ok, data }` / `{ ok: false, error }` `--json` envelope and ECP exit codes. Install accepts an npm name, a short name (`test` → `@executioncontrolprotocol/plugin-test`) or a tarball path; installing an installed plugin is a no-op. After install or link the command checks the plugin's manifest and exits 2 with a regenerate hint when it is missing, version 1.0 or invalid. A running host reloads after every change. oclif's plugin commands are no longer registered (its installer is still used underneath).
