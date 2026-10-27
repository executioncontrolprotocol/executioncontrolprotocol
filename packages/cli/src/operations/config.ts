import { z } from "zod"
import { defineOperation } from "@executioncontrolprotocol/plugin-sdk"

/** `ecp config` topic help. @category CLI */
export const configTopicOperation = defineOperation("config")
  .withInput(z.object({}))
  .withMetadata({
    summary: "Manage local CLI configuration",
    description:
      "Host-local settings for this machine, not workflow files. Subcommands: secrets. Variables and secrets are stored here.",
    useCases: ["Keep machine-local values out of workflow files"],
  })
  .withHandler(async () =>
    [
      "Usage: ecp config <subcommand>",
      "",
      "  secrets    Store and inspect OS keychain values",
      "",
      "Keep variables and secrets out of workflow files.",
      "Run ecp config <cmd> --help for flags.",
    ].join("\n")
  )
  .build()
