#!/usr/bin/env node
import { readdirSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const rows = []

function walk(dir, base = "") {
  for (const name of readdirSync(dir)) {
    if (["node_modules", "dist", "coverage", ".git"].includes(name)) continue
    const full = path.join(dir, name)
    const rel = path.join(base, name).split(path.sep).join("/")
    const st = statSync(full)
    if (st.isDirectory()) walk(full, rel)
    else if (/\.(md|mdx|mdc)$/i.test(name)) rows.push(rel)
  }
}

walk(root)
rows.sort()

const groups = {
  "Top-level docs": (r) => !r.includes("/") && r.endsWith(".md"),
  "Agent rules": (r) => r.startsWith(".cursor/rules/"),
  "Plan / phases / spec": (r) => r.startsWith("realignment/"),
  "Package READMEs": (r) => r.startsWith("packages/") && r.endsWith("README.md"),
  "Plugin READMEs": (r) => r.startsWith("plugins/") && r.endsWith("README.md"),
  "Contributor skill": (r) => r.startsWith("skills/"),
  Examples: (r) => r.startsWith("examples/"),
  Other: () => true,
}

const assigned = new Set()
const byGroup = {}
for (const [g, pred] of Object.entries(groups)) {
  byGroup[g] = rows.filter((r) => !assigned.has(r) && pred(r))
  for (const r of byGroup[g]) assigned.add(r)
}

let out = `# Docs and rules index

Every markdown file and agent rule in the MVP tree (updated Phase 9). Regenerate with
\`node scripts/gen-doc-index.mjs\` when docs are added or removed.

## How agents load rules

- **Claude Code:** \`CLAUDE.md\` → \`@AGENTS.md\`; points to \`.cursor/rules/\`, the spec and the plan.
- **Cursor:** \`.cursor/rules/*.mdc\` (\`alwaysApply: true\` ones always; others by \`globs\`).
- **Contributor skill:** \`skills/ecp-core/\` (\`SKILL.md\` + \`references/\`).
- **Source of truth:** \`realignment/spec/\`, then \`REALIGNMENT-PLAN.md\`, then phase docs.

## Summary

| Group | Files |
| --- | --- |
`

for (const [g, list] of Object.entries(byGroup)) {
  if (list.length === 0) continue
  out += `| ${g} | ${list.length} |\n`
}

out += `\n## All files\n\n| File | Group | Status |\n| --- | --- | --- |\n`
for (const [g, list] of Object.entries(byGroup)) {
  for (const f of list) out += `| \`${f}\` | ${g} | current |\n`
}

writeFileSync(path.join(root, "realignment/doc-index.md"), out)
console.log(`wrote ${rows.length} entries`)
