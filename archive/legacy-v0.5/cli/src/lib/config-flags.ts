import { Flags } from "@oclif/core";

/** Shared flags for commands that read or write system config. */
export const configScopeFlags = {
  global: Flags.boolean({
    char: "g",
    description: "Use global config under ~/.ecp/ (instead of project ./ecp.config.*)",
    default: false,
  }),
  config: Flags.string({
    char: "c",
    description: "Explicit path to config file (overrides default search and --global)",
  }),
};
