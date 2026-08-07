/** Thrown when registering into a frozen registry. @category Runtime */
export class RegistryFrozenError extends Error {
  /** Error code for programmatic handling. */
  readonly code = "REGISTRY_FROZEN" as const

  constructor(reason?: string) {
    super(reason ?? "Registry is frozen")
    this.name = "RegistryFrozenError"
  }
}

/** Thrown when namespace guard denies registration. @category Runtime */
export class RegistryRegistrationDeniedError extends Error {
  /** Error code for programmatic handling. */
  readonly code = "REGISTRY_REGISTRATION_DENIED" as const

  constructor(id: string, reason?: string) {
    super(reason ?? `Registration denied for ${id}`)
    this.name = "RegistryRegistrationDeniedError"
  }
}
