import HostRestart from "./restart.js"

/**
 * `ecp host reload` — alias of {@link HostRestart}.
 * @category CLI
 */
export default class HostReload extends HostRestart {
  static override id = "host:reload"
  static override aliases = []

  static override description =
    "Re-read plugins and config by draining running work and restarting the host; same as `ecp host restart`."

  static override examples = [
    {
      description: "Picks up a newly linked or updated plugin without stopping the background host for long.",
      command: "<%= config.bin %> host reload",
    },
  ]
}