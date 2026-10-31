import { useState } from "react"
import { Link } from "react-router-dom"
import { formatDistanceToNow } from "date-fns"
import {
  ArrowRight,
  CalendarDays,
  FolderGit2,
  Github,
  Globe,
  Lock,
  Plus,
  Wrench,
} from "lucide-react"
import { AddRepoDialog } from "@/components/app/AddRepoDialog"
import { EmptyState } from "@/components/app/EmptyState"
import { ErrorState } from "@/components/app/ErrorState"
import { ReposSkeleton } from "@/components/app/LoadingSkeletons"
import { RepositoryCard } from "@/components/app/RepositoryCard"
import { StatCard } from "@/components/app/StatCard"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/hooks/useAuth"
import { useRepos } from "@/hooks/useRepos"
import { recentRepoIds } from "@/lib/recent-repos"

function signIn() {
  window.location.href = "/auth/github"
}

function PublicDashboard() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center py-10 sm:py-16">
      <div className="text-center">
        <Badge variant="secondary" className="mb-5 gap-1.5">
          <Wrench className="size-3" />
          Repository insights for maintainers
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-5xl">
          See how healthy your repositories really are.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-balance text-muted-foreground sm:text-lg">
          Connect GitHub to scan repository health, activity, dependencies,
          workflows, structure, and contributor tool adoption.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <Button size="lg" onClick={signIn}>
            <Github className="size-4" />
            Sign in with GitHub
          </Button>
          <p className="text-xs text-muted-foreground">
            Read-only access. Public repositories only.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [recentIds] = useState(() => recentRepoIds())
  const { user, isLoading } = useAuth()
  const reposQuery = useRepos(Boolean(user))
  const repos = reposQuery.data?.repositories ?? []

  if (isLoading) return <ReposSkeleton />
  if (!user) return <PublicDashboard />

  const sortedRepos = [...repos].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  )
  const newestRepo = sortedRepos[0]
  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  const addedThisMonth = repos.filter(
    (repo) => Date.parse(repo.createdAt) >= monthAgo,
  ).length
  const publicRepos = repos.filter((repo) => !repo.isPrivate).length
  const privateRepos = repos.length - publicRepos
  const stats = [
    {
      label: "Repositories",
      value: repos.length,
      icon: FolderGit2,
      detail: `${publicRepos} public · ${privateRepos} private`,
    },
    {
      label: "Added this month",
      value: addedThisMonth,
      icon: CalendarDays,
      detail: "Repositories connected in the last 30 days",
    },
    {
      label: "Latest repository",
      value: (
        <span className="block truncate text-lg">
          {newestRepo?.name ?? "—"}
        </span>
      ),
      icon: FolderGit2,
      detail: newestRepo
        ? `${newestRepo.owner} · added ${formatDistanceToNow(new Date(newestRepo.createdAt), { addSuffix: true })}`
        : undefined,
    },
  ]
  const publicShare =
    repos.length > 0 ? Math.round((publicRepos / repos.length) * 100) : 0
  const reposById = new Map(repos.map((repo) => [repo.id, repo]))
  const remembered = recentIds
    .map((id) => reposById.get(id))
    .filter((repo) => repo !== undefined)
    .slice(0, 2)
  const recentRepos =
    remembered.length > 0 ? remembered : sortedRepos.slice(0, 2)

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="A quick view of your repositories and the areas that need attention."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" />
            Add repository
          </Button>
        }
      />

      <AddRepoDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      {reposQuery.isLoading ? (
        <ReposSkeleton />
      ) : reposQuery.isError ? (
        <ErrorState
          error={reposQuery.error ?? new Error("Unknown error")}
          onRetry={() => reposQuery.refetch()}
        />
      ) : repos.length === 0 ? (
        <EmptyState
          icon={FolderGit2}
          title="No repositories yet"
          description="Connect a GitHub repository to start tracking its health and tool adoption."
          action={
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" />
              Add repository
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-3">
              {stats.map((stat) => (
                <StatCard
                  key={stat.label}
                  label={stat.label}
                  value={stat.value}
                  detail={stat.detail}
                  icon={stat.icon}
                />
              ))}
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">Recent repositories</h2>
                  <p className="text-sm text-muted-foreground">
                    Jump back into the repositories you viewed most recently.
                  </p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/repos">
                    View all
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {recentRepos.map((repo) => (
                  <RepositoryCard key={repo.id} repo={repo} />
                ))}
              </div>
            </div>
          </div>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Workspace</CardTitle>
              <CardDescription>
                Access, recent changes, and shortcuts for this workspace.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium">Repository access</span>
                  <span className="text-muted-foreground">{repos.length}</span>
                </div>
                <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="bg-primary"
                    style={{ width: `${publicShare}%` }}
                  />
                  <div
                    className="bg-muted-foreground/40"
                    style={{ width: `${100 - publicShare}%` }}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Globe className="size-3.5" />
                    {publicRepos} public
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Lock className="size-3.5" />
                    {privateRepos} private
                  </span>
                </div>
              </div>

              {newestRepo ? (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Most recently added
                    </p>
                    <Link
                      to={`/repos/${newestRepo.id}`}
                      className="mt-1 flex items-center justify-between gap-3 rounded-md text-sm font-medium hover:text-primary"
                    >
                      <span className="truncate">{newestRepo.fullName}</span>
                      <ArrowRight className="size-4 shrink-0" />
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(newestRepo.createdAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </>
              ) : null}

              <Separator />
              <div className="flex flex-col gap-2">
                <Button variant="outline" asChild>
                  <Link to="/repos">
                    Browse repositories
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="size-4" />
                  Add repository
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
