# Repository rulesets

## `protect-development.json`

Ruleset for the **`development`** branch:

- **Pull requests** — Changes must go through a PR before merging into `development`.
- **Restrict updates** — Only actors with bypass permission can push directly to `development` (everyone else must land changes via PR merge). Set bypass in the ruleset UI if specific accounts should be allowed to push.
- **Required status checks** — Context strings must match GitHub **exactly**. CI uses the reusable workflow `ci-pipeline.yml` (`name: ci`), with single-word job names (`build`, `unit`, `integration`, `e2e`). Each check is `ci / <job name>`. GitHub inserts a single ` / ` between workflow name and job name; that cannot be removed. If anything stays “Expected” while jobs are green, copy the check title from the PR **Checks** tab into `required_status_checks`, then re-import/update the ruleset.

## `protect-main.json`

Ruleset for **`main`**:

- **Deletion** — The branch cannot be deleted.
- **Force push** — Blocked (`non_fast_forward`).
