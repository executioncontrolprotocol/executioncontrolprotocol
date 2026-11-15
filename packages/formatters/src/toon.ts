import { encode } from "@toon-format/toon"
import { IMPLEMENTATION_IDS, type Formatter } from "@executioncontrolprotocol/protocol"

/**
 * TOON text formatter.
 * @category Formatters
 */
export class ToonFormatter implements Formatter {
  /** Implementation id. */
  static readonly id = IMPLEMENTATION_IDS.toonFormatter

  /** Media type. */
  readonly mediaType = "text/toon"

  /** Accepts the service context (unused). */
  constructor(_ctx?: unknown) {}

  /** Render a JSON value as TOON. */
  format(value: unknown): string {
    return encode(value as never)
  }
}
