import { rmSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (name === "node_modules") continue
      if (name === "dist") {
        rmSync(p, { recursive: true, force: true })
        continue
      }
      walk(p)
    } else if (name.endsWith(".tsbuildinfo")) {
      rmSync(p, { force: true })
    }
  }
}

walk(join(root, "packages"))
