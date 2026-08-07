import type { Ecp } from "@executioncontrolprotocol/core"
import type { ValidationResult, WorkflowManifest } from "@executioncontrolprotocol/types"
import { encodeAuthoringPanels, type BrowserPanelsEcp } from "./browser-authoring-panels.js"

/** UI-ready encoded panel outputs. @category Authoring */
export interface AuthoringPanels {
  /** Fluent API source. */
  fluent: string
  /** JSON manifest string. */
  json: string
  /** Compact TOON workflow. */
  toon: string
  /** Mermaid flowchart source. */
  mermaid: string
  /** Latest patch TOON (empty when none). */
  patch: string
}

/** @deprecated Use harness invoke + {@link encodeAuthoringPanels}. @category Authoring */
export interface CreateWorkflowResult {
  manifest: WorkflowManifest
  validation: ValidationResult
  panels: AuthoringPanels
}

/** @deprecated Use harness invoke + {@link encodeAuthoringPanels}. @category Authoring */
export interface PatchWorkflowResult {
  manifest: WorkflowManifest
  validation: ValidationResult
  panels: AuthoringPanels
  patchToon: string
}

/**
 * Panel encoding helper for the browser demo (workflow authoring uses harnesses).
 * @category Authoring
 */
export class BrowserAuthoringService {
  constructor(private readonly ecp: BrowserPanelsEcp) {}

  /** Encode canonical workflow manifest into panel views. @category Authoring */
  encodePanels(manifest: WorkflowManifest, patchToon = ""): Promise<AuthoringPanels> {
    return encodeAuthoringPanels(this.ecp, manifest, patchToon)
  }
}

/** @category Authoring */
export type BrowserOperationalEcp = Ecp
