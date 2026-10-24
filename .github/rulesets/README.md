# Repository rulesets

## `protect-development.json`

Ruleset for the **`development`** branch:

- **Pull requests** — Changes must go through a PR before merging into `development`.
- **Required status checks** — Context strings must match the PR **Checks** tab **exactly**. With a **reusable** CI workflow, the first segment is often the **caller job id** in `ci.yml` (e.g. `pipeline` → `pipeline / build`), not necessarily the entry workflow’s top-level `name:`. Some workflows emit a **single** context (e.g. `changeset-status` from `.github/workflows/development.yml`). See `.cursor/rules/github-rulesets.mdc`. Re-import or paste `integration_id` for GitHub Actions when applying the ruleset. Do **not** require a check named `version`; that was the pre-Changesets lockstep job and it no longer runs.

## `protect-main.json`

Ruleset for **`main`**:

- **Deletion** — The branch cannot be deleted.
- **Force push** — Blocked (`non_fast_forward`).
