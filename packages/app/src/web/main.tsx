import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { AppShell } from "../ui/AppShell.js"
import { APP_TOKEN_QUERY } from "../host/constants.js"
import { createLocalHostAdapter } from "../host/local-client.js"
import "../ui/styles/globals.css"

const params = new URLSearchParams(window.location.search)
const token = params.get(APP_TOKEN_QUERY) ?? ""
const adapter = createLocalHostAdapter({
  baseUrl: window.location.origin,
  token,
})

const root = document.getElementById("root")
if (!root) {
  throw new Error("ECP App: #root is missing")
}

createRoot(root).render(
  <StrictMode>
    <AppShell adapter={adapter} />
  </StrictMode>
)
