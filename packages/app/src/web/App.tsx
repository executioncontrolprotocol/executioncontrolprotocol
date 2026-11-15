import { useCallback, useEffect, useMemo, useState } from "react"
import { Home, ShieldAlert } from "lucide-react"
import {
  AppHostClient,
  fragmentWithoutToken,
  resolveLaunch,
  type AppLaunchParams,
} from "../client/index.js"
import { HomeView, type OpenTarget } from "./components/HomeView.js"
import { Workspace } from "./components/Workspace.js"
import type { ExecutionSource } from "./hooks/useExecutionDocument.js"

function readLaunch(): AppLaunchParams {
  const params = resolveLaunch(window.location.hash, window.sessionStorage)
  const nextHash = fragmentWithoutToken(params)
  if (window.location.hash !== nextHash) {
    const url = `${window.location.pathname}${window.location.search}${nextHash}`
    window.history.replaceState(null, "", url)
  }
  return params
}

function Header({ onHome }: { onHome?: () => void }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-outline-variant bg-surface-container-low px-gutter">
      <h1 className="font-display text-headline font-semibold tracking-tight text-on-surface">ECP</h1>
      {onHome ? (
        <button
          type="button"
          data-testid="nav-home"
          onClick={onHome}
          className="inline-flex items-center gap-1.5 rounded px-2 py-1 font-mono text-label text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
        >
          <Home className="h-3.5 w-3.5" aria-hidden="true" />
          Home
        </button>
      ) : null}
    </header>
  )
}

function Unauthorized() {
  return (
    <main
      data-testid="unauthorized"
      className="flex flex-1 flex-col items-center justify-center gap-3 p-canvas-padding text-center"
    >
      <ShieldAlert className="h-8 w-8 text-error" aria-hidden="true" />
      <h2 className="font-display text-lg font-semibold text-on-surface">Not authorized</h2>
      <p className="max-w-md text-sm text-on-surface-variant">
        The host rejected this page or no token was given. Open the App with{" "}
        <code className="font-mono">ecp app</code>, which adds the host token to the address.
      </p>
    </main>
  )
}

function sourceOf(open: string | undefined, id: string | undefined): ExecutionSource | undefined {
  if (open) return { kind: "path", path: open }
  if (id) return { kind: "id", id }
  return undefined
}

/**
 * Root component. Reads the launch fragment (the token goes to `sessionStorage`), then shows
 * the home view or the execution workspace, or the unauthorised screen when there is no token
 * or the host answers 401.
 * @category App
 */
export function App() {
  const [launch, setLaunch] = useState<AppLaunchParams>(readLaunch)
  const [unauthorized, setUnauthorized] = useState(false)
  const markUnauthorized = useCallback(() => setUnauthorized(true), [])

  const client = useMemo(
    () =>
      launch.token
        ? new AppHostClient(window.location.origin, launch.token, { onUnauthorized: markUnauthorized })
        : undefined,
    [launch.token, markUnauthorized],
  )

  useEffect(() => {
    const onNavigate = () => setLaunch(readLaunch())
    window.addEventListener("popstate", onNavigate)
    window.addEventListener("hashchange", onNavigate)
    return () => {
      window.removeEventListener("popstate", onNavigate)
      window.removeEventListener("hashchange", onNavigate)
    }
  }, [])

  const navigate = useCallback((target: OpenTarget) => {
    setLaunch((current) => {
      const next: AppLaunchParams = {
        ...(current.token ? { token: current.token } : {}),
        ...(current.dir ? { dir: current.dir } : {}),
        ...(target.open ? { open: target.open } : {}),
        ...(target.id && !target.open ? { id: target.id } : {}),
      }
      const url = `${window.location.pathname}${window.location.search}${fragmentWithoutToken(next)}`
      window.history.pushState(null, "", url)
      return next
    })
  }, [])

  const goHome = useCallback(() => navigate({}), [navigate])
  const { open, id } = launch
  const source = useMemo(() => sourceOf(open, id), [open, id])
  const sourceKey = source ? (source.kind === "path" ? `path:${source.path}` : `id:${source.id}`) : ""
  const authorized = Boolean(client) && !unauthorized

  return (
    <div className="flex h-full flex-col">
      <Header onHome={authorized && source ? goHome : undefined} />
      {!authorized || !client ? (
        <Unauthorized />
      ) : source ? (
        <Workspace key={sourceKey} client={client} source={source} onUnauthorized={markUnauthorized} />
      ) : (
        <HomeView client={client} dir={launch.dir} onOpen={navigate} />
      )}
      <footer className="status-footer">
        <span className="font-mono text-label text-on-surface-variant">Execution Control Protocol</span>
      </footer>
    </div>
  )
}
