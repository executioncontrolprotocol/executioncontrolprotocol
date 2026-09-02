#!/usr/bin/env node
/**
 * Detect CI track for two-track ECP consumer workflows.
 * Prints "main" or "development".
 */
const ref = process.env.GITHUB_REF ?? ""
const baseRef = process.env.GITHUB_BASE_REF ?? ""

const isMain =
  ref === "refs/heads/main" ||
  baseRef === "main"

console.log(isMain ? "main" : "development")
