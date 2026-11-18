import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import { safePluginId } from "@executioncontrolprotocol/engine"
import type { ServiceContext } from "@executioncontrolprotocol/engine"
import { IMPLEMENTATION_IDS, type EditorSchemaFileStat, type EditorSchemaFiles } from "@executioncontrolprotocol/protocol"
import type { EditorSchemaWriteResult } from "./editor-schema.js"

/**
 * Shared promise holder for the host startup editor write.
 * @category Host
 */
export interface EditorSchemaWriteRef {
  /** Resolves when editor schema files are current. */
  promise: Promise<EditorSchemaWriteResult>
}

/**
 * Local {@link EditorSchemaFiles} backed by `$ECP_HOME/schema`.
 * @category Host
 */
export class LocalEditorSchemaFiles implements EditorSchemaFiles {
  /** Implementation id. */
  static readonly id = IMPLEMENTATION_IDS.editorSchemaFiles

  private readonly home: string
  private readonly writeRef: EditorSchemaWriteRef

  /**
   * @param ctx - Service context with `options.writeRef`.
   */
  constructor(ctx: ServiceContext) {
    this.home = ctx.settings.home
    const ref = (ctx.options as { writeRef?: EditorSchemaWriteRef } | undefined)?.writeRef
    if (!ref) {
      throw new Error("LocalEditorSchemaFiles requires options.writeRef.")
    }
    this.writeRef = ref
  }

  /** @inheritdoc */
  async ensureCurrent(): Promise<void> {
    await this.writeRef.promise
  }

  /** @inheritdoc */
  async stat(pluginId?: string): Promise<EditorSchemaFileStat> {
    await this.ensureCurrent()
    if (!pluginId) {
      const filePath = path.join(this.home, "schema", "execution.schema.json")
      const info = await stat(filePath)
      return { id: "root", path: filePath, bytes: info.size }
    }
    const filePath = path.join(this.home, "schema", "plugins", `${safePluginId(pluginId)}.editor.schema.json`)
    const info = await stat(filePath)
    return { id: pluginId, path: filePath, bytes: info.size }
  }

  /** @inheritdoc */
  async read(absolutePath: string): Promise<Record<string, unknown>> {
    const text = await readFile(absolutePath, "utf8")
    return JSON.parse(text) as Record<string, unknown>
  }
}