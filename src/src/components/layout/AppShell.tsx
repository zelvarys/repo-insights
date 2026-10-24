import { useState } from "react"
import { Link, NavLink, Outlet } from "react-router-dom"
import {
  FolderGit2,
  Github,
  GitBranch,
  LayoutDashboard,
  Menu,
} from "lucide-react"
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
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/app/repos", label: "Repositories", icon: FolderGit2, end: false },
]

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )
          }
        >
          <item.icon className="size-4" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-16 items-center border-b px-6">
          <Link to="/app" className="flex items-center gap-2 font-semibold">
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
                    to="/app"
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

          <Link to="/app" className="flex items-center gap-2 font-semibold md:hidden">
            <GitBranch className="size-5" />
            repo-insights
          </Link>

          <div className="hidden flex-1 text-sm text-muted-foreground md:block">
            Tool adoption for your repositories
          </div>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <Button variant="outline" size="sm" asChild>
              <a href="/auth/github">
                <Github className="size-4" />
                Sign in
              </a>
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
