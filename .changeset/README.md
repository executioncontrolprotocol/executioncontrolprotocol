# Changesets

Independent versioning for `@executioncontrolprotocol/*` packages. `baseBranch` is `development`. Prereleases use the `next` dist-tag from the milestone (`changeset pre enter next`). Phase 9 publishes `latest` from `main`.

Add a changeset with `pnpm exec changeset`. Do not npm publish from this milestone unless you dispatch `release-next.yml` on purpose.
