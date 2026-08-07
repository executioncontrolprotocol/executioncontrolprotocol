/** Minimal typing for Vite `import.meta.glob` in browser eval helpers. */
interface ImportMeta {
  glob: (
    pattern: string,
    options?: { eager?: boolean; import?: string }
  ) => Record<string, unknown>
}
