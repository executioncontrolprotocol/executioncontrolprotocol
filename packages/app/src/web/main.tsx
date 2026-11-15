import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@xyflow/react/dist/style.css"
import "./styles.css"
import { App } from "./App.js"

const container = document.getElementById("root")
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
