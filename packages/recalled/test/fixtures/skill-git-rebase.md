# Git Rebase Skill

## Prerequisites

- Git 2.x installed
- A working branch with commits ahead of the base

## Procedure

1. Checkout the feature branch: `git checkout feat/my-feature`
2. Fetch latest upstream: `git fetch origin`
3. Rebase onto the target: `git rebase origin/main`
4. Resolve any conflicts in each step
5. Continue the rebase: `git rebase --continue`
6. Force push when done: `git push --force-with-lease`

## Failure Handling

- If a conflict is too complex, abort with `git rebase --abort`
- Never force push to `main` or `production` branches
- If you lose commits, check `git reflog` within 30 days

## Configuration

```bash
git config pull.rebase true
git config rebase.autoStash true
```

## Related

- See also: Git Merge Skill
- See also: Branch Management Policy
