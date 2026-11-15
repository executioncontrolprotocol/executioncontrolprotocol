import { toCommands } from "@executioncontrolprotocol/plugin-sdk"
import { operations } from "./operations/index.js"

/**
 * CLI command classes generated from host operations.
 * oclif loads this map with the explicit strategy.
 * @category CLI
 */
export const COMMANDS = toCommands(operations)
