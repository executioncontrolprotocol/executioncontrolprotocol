export function readFileSync(): never {
  throw new Error("node:fs is not available in browser eval")
}

export function readdirSync(): never {
  throw new Error("node:fs is not available in browser eval")
}

export function appendFileSync(): void {}

export function mkdirSync(): void {}

export default {}
