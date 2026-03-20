import { Command, Flags } from "@oclif/core";

import { listTraceIds } from "../../lib/trace-files.js";
import { getDefaultTraceDir } from "../../lib/ecp-home.js";

export default class TraceList extends Command {
  static summary = "List locally available traces";

  static flags = {
    "trace-dir": Flags.string({
      description: "Directory for trace files",
      default: getDefaultTraceDir(),
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TraceList);
    const traceDir = flags["trace-dir"];

    try {
      const ids = await listTraceIds(traceDir);
      if (ids.length === 0) {
        console.log(`No trace files found in ${traceDir}.`);
        return;
      }

      console.log(`Available traces in ${traceDir}:`);
      for (const id of ids) {
        console.log(`- ${id}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.error(msg, { exit: 1 });
    }
  }
}

