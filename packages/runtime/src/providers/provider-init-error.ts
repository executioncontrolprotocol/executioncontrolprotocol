export class ProviderInitializationError extends Error {
  /**
   * Optional human hint for the user (e.g. missing env var).
   * Intended to be displayed by the CLI.
   */
  readonly hint?: string;

  constructor(message: string, opts: { hint?: string } = {}) {
    super(message);
    this.name = "ProviderInitializationError";
    this.hint = opts.hint;
  }
}

