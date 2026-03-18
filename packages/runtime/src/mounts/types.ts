/**
 * Types for the staged mount hydration system.
 *
 * Mounts retrieve data from external tool servers in three stages
 * (seed → focus → deep) to avoid blowing up the context window.
 *
 * @category Mounts
 */

import type { Mount } from "@executioncontrolprotocol/spec";
import type { MountOutput, MountRef, ResolvedInputs } from "../engine/types.js";

/**
 * Interpolation context available when resolving mount arguments.
 *
 * @category Mounts
 */
export interface InterpolationContext {
  /** Resolved Context inputs. */
  inputs: ResolvedInputs;

  /** The current item ID (for focus/deep mounts iterating over selectors). */
  item?: string;
}

/**
 * A request to hydrate a single mount.
 *
 * @category Mounts
 */
export interface HydrationRequest {
  /** The mount definition from the Context. */
  mount: Mount;

  /** Values for template interpolation in mount args. */
  interpolation: InterpolationContext;

  /**
   * For focus/deep mounts: the selected item IDs to expand.
   * Derived from the plan output via `mount.when.selectorFrom`.
   */
  selectedIds?: string[];
}

/**
 * Result of selecting items from a plan output for focus/deep expansion.
 *
 * @category Mounts
 */
export interface SelectorResult {
  /** The IDs extracted from the plan output. */
  ids: string[];

  /** Whether the selection was capped by `maxSelected`. */
  wasCapped: boolean;

  /** Original count before capping. */
  originalCount: number;
}

/**
 * Internal representation of mounted data within the engine.
 *
 * @category Mounts
 */
export type MountData =
  | { kind: "refs"; refs: MountRef[] }
  | { kind: "expanded"; items: unknown[] }
  | { kind: "error"; error: string };

/**
 * Interface for the mount hydration service.
 *
 * @category Mounts
 */
export interface MountHydrator {
  /**
   * Hydrate all mounts for a given stage, respecting limits and selectors.
   *
   * @param requests - The mounts to hydrate.
   * @returns The hydrated mount outputs.
   */
  hydrate(requests: HydrationRequest[]): Promise<MountOutput[]>;
}
