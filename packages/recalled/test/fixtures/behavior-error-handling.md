# Error Handling Policy

## Overview

All executors must follow these error handling rules when interacting with external systems.

## Retry Rules

- HTTP 429 (rate limit): wait and retry with exponential backoff (max 3 retries)
- HTTP 5xx (server error): retry up to 2 times with 5 second delay
- HTTP 4xx (client error): do not retry, report the error immediately
- Timeout errors: retry once with doubled timeout

## Escalation

- If all retries are exhausted, escalate to the orchestrator
- Never silently swallow errors
- Always log the full error chain before escalation

## Secrets and Credentials

- Never log API keys or tokens in error messages
- Redact sensitive headers (Authorization, X-Api-Key) in debug output
- Rotate credentials immediately if exposure is suspected

## Circuit Breaker

When a service fails 5 consecutive times within 60 seconds:

1. Open the circuit breaker
2. Return cached results if available
3. Log a warning with the service name
4. Attempt recovery after 30 seconds
