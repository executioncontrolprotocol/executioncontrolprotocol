# @executioncontrolprotocol/jsonata

Optional first-party plugin. Supplies `@executioncontrolprotocol/jsonata.transform` for step-level
`expression` transforms using [JSONata](https://jsonata.org/). Not bundled with the host; install
with `ecp plugins install jsonata`.

Each evaluation runs in a short-lived child Node.js process with a 64 MiB heap. The child is killed
when the step times out (capability `timeoutMs`, 1000 ms) or is cancelled, so a runaway or
memory-hungry expression fails the step without affecting the host.
