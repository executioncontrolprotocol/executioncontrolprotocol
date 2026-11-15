#!/usr/bin/env node
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { Endpoint } from "@executioncontrolprotocol/protocol"
import { createLocalHost } from "./create-local-host.js"
import { HttpApiEndpoint } from "./http/http-api-endpoint.js"

const EXIT_CLEAN = 0
const EXIT_CRASH = 1
const EXIT_ADDRINUSE = 70

/**
 * Host process entry: parse env, start server mode, handle signals.
 * @category Host
 */
export async function main(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const home = path.resolve(env.ECP_HOME ?? path.join(os.homedir(), ".ecp"))
  const port = Number(env.ECP_HOST_PORT ?? "0")
  const token = env.ECP_HOST_TOKEN
  if (!token) {
    console.error("ECP_HOST_TOKEN is required.")
    process.exit(EXIT_CRASH)
  }
  try {
    const host = await createLocalHost({
      home,
      mode: "server",
      port: Number.isFinite(port) ? port : 0,
      token,
      exitOnShutdown: true,
      logLevel: (env.ECP_LOG_LEVEL as "debug" | "info" | "warn" | "error" | undefined) ?? "info",
    })
    if (env.ECP_TIMING === "1") {
      console.error(
        JSON.stringify({
          timing: host.timing,
          url: host.url,
          schemaHash: host.schemaHash,
        }),
      )
    }
    let stopping = false
    const shutdown = async (): Promise<void> => {
      if (stopping) return
      stopping = true
      try {
        const endpoint = host.services.get(Endpoint, HttpApiEndpoint.id) as HttpApiEndpoint
        await endpoint.drain(30_000)
        await host.stop()
      } catch {
        // best effort
      }
      process.exit(EXIT_CLEAN)
    }
    process.on("SIGINT", () => {
      void shutdown()
    })
    process.on("SIGTERM", () => {
      void shutdown()
    })
    await host.whenShutdown()
    process.exit(EXIT_CLEAN)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "EADDRINUSE") process.exit(EXIT_ADDRINUSE)
    console.error(error instanceof Error ? error.message : error)
    process.exit(EXIT_CRASH)
  }
}

const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(path.resolve(entry)).href) {
  void main()
}
