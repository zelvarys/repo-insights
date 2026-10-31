import { useState } from "react"
import { Link, NavLink, Outlet, useLocation } from "react-router-dom"
import {
  Activity,
  ArrowLeft,
  FolderGit2,
  FolderTree,
  Gauge,
  Github,
  GitBranch,
  LayoutDashboard,
  Menu,
  Package,
  Settings,
  Workflow,
  Wrench,
} from "lucide-react"
import { UserMenu } from "@/components/app/UserMenu"
import { useAuth } from "@/hooks/useAuth"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/repos", label: "Repositories", icon: FolderGit2, end: true },
]

const repoFeatures = [
  { tab: "overview", label: "Overview", icon: Gauge },
  { tab: "activity", label: "Activity", icon: Activity },
  { tab: "structure", label: "Structure", icon: FolderTree },
  { tab: "dependencies", label: "Dependencies", icon: Package },
  { tab: "workflows", label: "Workflows", icon: Workflow },
  { tab: "tools", label: "Tools", icon: Wrench },
]

function repoContext(pathname: string) {
  const match = /^\/repos\/([^/]+)(\/settings)?\/?$/.exec(pathname)
  if (!match) return null
  return { repoId: match[1]!, settings: Boolean(match[2]) }
}

function navClass(active: boolean) {
  return cn(
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
  )
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation()
  const context = repoContext(location.pathname)
  const activeTab =
    new URLSearchParams(location.search).get("tab") ?? "overview"

  return (
    <nav className="flex flex-col gap-1">
      {context ? (
        <Link to="/dashboard" onClick={onNavigate} className={navClass(false)}>
          <ArrowLeft className="size-4" />
          Dashboard
        </Link>
      ) : (
        navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) => navClass(isActive)}
          >
            <item.icon className="size-4" />
            {item.label}
          </NavLink>
        ))
      )}

      {context ? (
        <div className="mt-3 space-y-1 border-t pt-3">
          <p className="px-3 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            This repository
          </p>
          {repoFeatures.map((item) => {
            const active = !context.settings && activeTab === item.tab
            const to =
              item.tab === "overview"
                ? `/repos/${context.repoId}`
                : `/repos/${context.repoId}?tab=${item.tab}`
            return (
              <Link
                key={item.tab}
                to={to}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={navClass(active)}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            )
          })}
          <Link
            to={`/repos/${context.repoId}/settings`}
            onClick={onNavigate}
            aria-current={context.settings ? "page" : undefined}
            className={navClass(context.settings)}
          >
            <Settings className="size-4" />
            Settings
          </Link>
        </div>
      ) : null}
    </nav>
  )
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user } = useAuth()

  if (!user) {
    return (
      <div className="flex min-h-svh flex-col bg-background">
        <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-6">
            <Link
              to="/dashboard"
              className="flex items-center gap-2 font-semibold"
            >
              <GitBranch className="size-5" />
              repo-insights
            </Link>
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-16 items-center border-b px-6">
          <Link
            to="/dashboard"
            className="flex items-center gap-2 font-semibold"
          >
            <GitBranch className="size-5" />
            repo-insights
          </Link>
        </div>
        <div className="flex-1 p-4">
          <NavItems />
        </div>
        <div className="border-t p-4">
          <Button variant="outline" className="w-full justify-start" asChild>
            <a
              href="https://github.com/zelvarys/repo-insights"
              target="_blank"
              rel="noreferrer"
            >
              <Github className="size-4" />
              View source
            </a>
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur md:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open navigation"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b p-6 text-left">
                <SheetTitle asChild>
                  <Link
                    to="/dashboard"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 font-semibold"
                  >
                    <GitBranch className="size-5" />
                    repo-insights
                  </Link>
                </SheetTitle>
              </SheetHeader>
              <div className="p-4">
                <NavItems onNavigate={() => setMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <Link
            to="/dashboard"
            className="flex items-center gap-2 font-semibold md:hidden"
          >
            <GitBranch className="size-5" />
            repo-insights
          </Link>

          <div className="hidden flex-1 text-sm text-muted-foreground md:block">
            Repository health and tool adoption
          </div>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <UserMenu />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
