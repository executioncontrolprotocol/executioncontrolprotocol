# 05 — Test session

Drive a workflow step-by-step with a frozen test session (`ecp test`). Distinct from `npm run test:unit` / harness evals.

## Loop

```bash
ecp test start examples/05-test-session/workflow.ts \
  --env examples/05-test-session/environment.ts \
  -o /tmp/echo.session.json

ecp test run --to collect \
  --env examples/05-test-session/environment.ts \
  --session /tmp/echo.session.json

ecp test run --to summarize \
  --env examples/05-test-session/environment.ts \
  --session /tmp/echo.session.json

ecp test rerun collect \
  --env examples/05-test-session/environment.ts \
  --session /tmp/echo.session.json

ecp test status --session /tmp/echo.session.json
```

`rerun` clears downstream history and `.as` state after the chosen step.
