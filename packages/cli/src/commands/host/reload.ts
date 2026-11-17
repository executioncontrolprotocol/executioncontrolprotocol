import HostRestart from "./restart.js"

/**
 * `ecp host reload` — alias of {@link HostRestart}.
 * @category CLI
 */
export default class HostReload extends HostRestart {
  static override id = "host:reload"
  static override aliases = []
}