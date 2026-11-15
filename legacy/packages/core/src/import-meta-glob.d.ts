/** Minimal typing for Vite `import.meta.glob` used in browser bundle loaders. */
interface ImportMeta {
  glob: (
    pattern: string,
    options?: {
      eager?: boolean
      import?: string
      query?: string
    },
  ) => Record<string, unknown>
}
