# AGENTS.md

## Cursor Cloud specific instructions

This is a **specification-only repository** (Execution Control Protocol / ECP). There is no application code, no build system, no test suite, and no runnable services. The repo contains three files:

- `README.md` — High-level overview of the ECP specification
- `SPEC.md` — Detailed protocol specification
- `spec.yaml` — Example ECP Context manifest (YAML, `ecp/v0.3-draft`)

### Linting

Two linters are available after the update script runs:

| Tool | Command | Scope |
|---|---|---|
| `yamllint` | `yamllint spec.yaml` | YAML syntax and style for `spec.yaml` |
| `markdownlint` | `markdownlint README.md SPEC.md` | Markdown style for documentation |

**Note:** `yamllint` installs to `~/.local/bin`. If not on `PATH`, prefix with `export PATH="$HOME/.local/bin:$PATH"`.

### Structural YAML validation

To verify the spec parses correctly as YAML and inspect its structure:

```sh
python3 -c "import yaml; doc=yaml.safe_load(open('spec.yaml')); print(doc['apiVersion'], doc['kind'], doc['metadata']['name'])"
```

### No build / test / run steps

There are no `npm`, `pip`, `cargo`, or other build/test commands. The development workflow is editing Markdown and YAML, then linting.
