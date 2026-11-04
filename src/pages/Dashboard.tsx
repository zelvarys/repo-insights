import { useState } from "react"
import { useQueries } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import type {
  OverviewResponse,
  RepoMetrics,
  TrackedRepository,
} from "@shared/types"
import {
  Activity,
  ArrowRight,
  FolderGit2,
  FolderTree,
  Gauge,
  GitFork,
  Github,
  Package,
  Plus,
  ScanLine,
  ShieldCheck,
  Star,
  Users,
  Workflow,
  Wrench,
} from "lucide-react"
import { AddRepoDialog } from "@/components/app/AddRepoDialog"
import { EmptyState } from "@/components/app/EmptyState"
import { ErrorState } from "@/components/app/ErrorState"
import { ReposSkeleton } from "@/components/app/LoadingSkeletons"
import { StatCard } from "@/components/app/StatCard"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useAuth } from "@/hooks/useAuth"
import { useRepos } from "@/hooks/useRepos"
import { api } from "@/lib/api"
import { recentRepoIds } from "@/lib/recent-repos"

const introFeatures = [
  {
    title: "Repository health",
    description:
      "Activity, dependencies, workflows, and commit quality combined into one score.",
    icon: ShieldCheck,
  },
  {
    title: "Commit activity",
    description:
      "See release cadence, contributor mix, and the commit messages that need work.",
    icon: Activity,
  },
  {
    title: "Dependencies",
    description:
      "Manifest dependencies with outdated versions and known advisories.",
    icon: Package,
  },
  {
    title: "Workflows and tools",
    description:
      "GitHub Actions reliability alongside contributor adoption of your tools.",
    icon: Workflow,
  },
  {
    title: "Repository structure",
    description:
      "File-type breakdowns, repository size, and an explorable source tree.",
    icon: FolderTree,
  },
  {
    title: "Contributor spread",
    description:
      "Understand bus factor and whether knowledge is concentrated in a few people.",
    icon: Users,
  },
]

const landingSteps = [
  "Connect your GitHub account with read-only access.",
  "Add the public repositories you want to track.",
  "Run a scan and review health, activity, dependencies, and tool adoption.",
]

function signIn() {
  window.location.href = "/auth/github"
}

function PublicDashboard() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Repository health and tool adoption at a glance."
      />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Badge variant="secondary" className="mb-2 w-fit gap-1.5">
              <Wrench className="size-3" />
              Repository insights for maintainers
            </Badge>
            <CardTitle className="text-2xl text-balance sm:text-3xl">
              See how healthy your repositories really are.
            </CardTitle>
            <CardDescription className="max-w-2xl text-base">
              Connect GitHub to scan repository health, activity, dependencies,
              workflows, structure, and how consistently contributors use your
              tools.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={signIn}>
              <Github className="size-4" />
              Connect GitHub
            </Button>
            <p className="text-xs text-muted-foreground">
              Read-only access. Public repositories only.
            </p>
          </CardContent>
        </Card>

        <div>
          <div className="mb-3">
            <h2 className="text-lg font-semibold">What you get</h2>
            <p className="text-sm text-muted-foreground">
              A complete picture of repository health in one place.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {introFeatures.map((feature) => (
              <Card key={feature.title}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <feature.icon className="size-4 text-primary" />
                    {feature.title}
                  </CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>How it works</CardTitle>
            <CardDescription>
              Start in a few minutes with read-only GitHub access.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <ol className="space-y-4">
              {landingSteps.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  <span className="text-sm text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

export default function Dashboard() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [recentIds] = useState(() => recentRepoIds())
  const { user, isLoading } = useAuth()
  const reposQuery = useRepos(Boolean(user))
  const repos = reposQuery.data?.repositories ?? []
  const reposById = new Map(repos.map((repo) => [repo.id, repo]))
  const recentRepositories = recentIds
    .map((id) => reposById.get(id))
    .filter((repo): repo is TrackedRepository => repo !== undefined)
    .slice(0, 3)
  const metricQueries = useQueries({
    queries: repos.map((repo) => ({
      queryKey: ["repo", repo.id, "metrics"],
      queryFn: () => api.get<RepoMetrics>(`/repos/${repo.id}/metrics`),
      enabled: Boolean(user),
    })),
  })
  const overviewQueries = useQueries({
    queries: repos.map((repo) => ({
      queryKey: ["repo", repo.id, "insights", "overview"],
      queryFn: () => api.get<OverviewResponse>(`/repos/${repo.id}/overview`),
      enabled: Boolean(user),
    })),
  })
  if (isLoading) return <ReposSkeleton />
  if (!user) return <PublicDashboard />

  const scannedMetrics = metricQueries
    .map((query) => query.data)
    .filter((metrics): metrics is RepoMetrics => Boolean(metrics?.scanId))
  const healthScores = overviewQueries
    .map((query) => query.data?.health?.score)
    .filter((score): score is number => typeof score === "number")
  const averageHealth =
    healthScores.length > 0
      ? healthScores.reduce((sum, score) => sum + score, 0) /
        healthScores.length
      : null
  const detectedTools = scannedMetrics.reduce(
    (sum, metrics) => sum + metrics.toolsDetected,
    0,
  )
  const scanCoverage =
    repos.length > 0
      ? Math.round((scannedMetrics.length / repos.length) * 100)
      : 0
  const metricsLoading =
    metricQueries.some((query) => query.isLoading) ||
    overviewQueries.some((query) => query.isLoading)
  const stats = [
    {
      label: "Average health",
      value: averageHealth === null ? "—" : averageHealth.toFixed(1),
      icon: Gauge,
      detail: metricsLoading
        ? "Loading repository health"
        : `${healthScores.length} scanned repositories`,
    },
    {
      label: "Scan coverage",
      value: `${scannedMetrics.length}/${repos.length}`,
      icon: ScanLine,
      detail: metricsLoading
        ? "Loading repository metrics"
        : `${scanCoverage}% of repositories scanned`,
    },
    {
      label: "Tools detected",
      value: detectedTools,
      icon: Wrench,
      detail: metricsLoading
        ? "Loading repository metrics"
        : "Across scanned repositories",
    },
  ]
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="A quick view of your repositories and the areas that need attention."
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

          <Card>
            <CardHeader>
              <CardTitle>Workspace</CardTitle>
              <CardDescription>
                Recent changes and shortcuts for this workspace.
              </CardDescription>
              <CardAction>
                <Button size="sm" onClick={() => setDialogOpen(true)}>
                  <Plus className="size-4" />
                  Add repository
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">
                  Recently visited
                </p>
                {recentRepositories.length === 0 ? (
                  <p className="py-3 text-sm text-muted-foreground">
                    No repositories visited yet.
                  </p>
                ) : (
                  <div className="mt-2 space-y-1 border-t pt-2">
                    {recentRepositories.map((repo, index) => (
                      <Link
                        key={repo.id}
                        to={`/repos/${repo.id}`}
                        className="group/repo -mx-2 flex items-center gap-3 rounded-lg px-2 py-3 text-sm transition-colors hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted/40 text-xs font-semibold tabular-nums text-muted-foreground">
                          {index + 1}
                        </span>
                        <span className="flex min-w-0 flex-1 items-center justify-between gap-4">
                          <span className="truncate font-medium">
                            {repo.fullName}
                          </span>
                          <span className="flex shrink-0 items-center gap-6 text-xs text-muted-foreground">
                            <span className="flex items-center gap-3">
                              <span
                                className="inline-flex items-center gap-1"
                                aria-label={`${repo.stars} stars`}
                              >
                                <Star className="size-3.5" aria-hidden="true" />
                                {repo.stars.toLocaleString()}
                              </span>
                              <span
                                className="inline-flex items-center gap-1"
                                aria-label={`${repo.contributorCount} contributors`}
                              >
                                <Users
                                  className="size-3.5"
                                  aria-hidden="true"
                                />
                                {repo.contributorCount.toLocaleString()}
                              </span>
                              <span
                                className="inline-flex items-center gap-1"
                                aria-label={`${repo.forks} forks`}
                              >
                                <GitFork
                                  className="size-3.5"
                                  aria-hidden="true"
                                />
                                {repo.forks.toLocaleString()}
                              </span>
                            </span>
                            <ArrowRight
                              className="size-4 shrink-0 transition-transform group-hover/repo:translate-x-0.5"
                              aria-hidden="true"
                            />
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-3 border-t pt-3">
                <Button variant="outline" className="w-full" asChild>
                  <Link to="/repos">
                    Browse repositories
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
