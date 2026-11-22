// Check the CSV against the background files before anything is uploaded or sent to Photoshop.
//
// Input: table ({ columns, rows } from core.parse-csv), backgroundPaths (local file paths).
// Output: { rows, backgrounds: [{ name, path }] } — rows unchanged; backgrounds are the files rows refer to, by
// file name (the last path segment), each listed once.
// Fails, naming every problem at once, when a column is missing, a row is incomplete, two files share a name, or
// a row refers to a file that wasn't given.

const required = ["title", "subtitle", "background"]
const missingColumns = required.filter((name) => !input.table.columns.includes(name))
if (missingColumns.length > 0) {
  throw new Error(`The CSV needs the columns ${required.join(", ")}; missing: ${missingColumns.join(", ")}.`)
}

const baseName = (filePath) => filePath.split(/[\\/]/).pop()
const byName = {}
const duplicates = []
for (const filePath of input.backgroundPaths) {
  const name = baseName(filePath)
  if (byName[name] && byName[name] !== filePath) duplicates.push(name)
  byName[name] = filePath
}

const problems = []
if (duplicates.length > 0) problems.push(`two background files share a name: ${[...new Set(duplicates)].join(", ")}`)
input.table.rows.forEach((row, index) => {
  const empty = required.filter((name) => row[name] === "")
  if (empty.length > 0) problems.push(`row ${index + 1} has no ${empty.join(", ")}`)
})
const missing = [...new Set(input.table.rows.map((row) => row.background).filter((name) => name && !byName[name]))]
if (missing.length > 0) {
  problems.push(`no background file named ${missing.join(", ")} (given: ${Object.keys(byName).join(", ") || "none"})`)
}
if (input.table.rows.length === 0) problems.push("the CSV has no rows")
if (problems.length > 0) throw new Error(`The variants can't be built: ${problems.join("; ")}.`)

const used = [...new Set(input.table.rows.map((row) => row.background))]
return { rows: input.table.rows, backgrounds: used.map((name) => ({ name, path: byName[name] })) }
