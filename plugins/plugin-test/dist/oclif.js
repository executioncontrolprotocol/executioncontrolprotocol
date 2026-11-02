import { toCommands } from "@executioncontrolprotocol/plugin-sdk"
import definition from "./index.js"

export const COMMANDS = toCommands(definition)
