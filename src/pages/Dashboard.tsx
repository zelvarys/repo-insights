import { useState } from "react"
import { useQueries } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { formatDistanceToNowStrict } from "date-fns"
import type { RepoMetrics, TrackedRepository } from "@shared/types"
import {
  Activity,
  ArrowRight,
  FolderGit2,
  FolderTree,
  Gauge,
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
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
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
                Connect GitHub to scan repository health, activity,
                dependencies, workflows, structure, and how consistently
                contributors use your tools.
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
            <div className="grid gap-4 md:grid-cols-2">
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
        </div>

        <Card className="h-fit">
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
  if (isLoading) return <ReposSkeleton />
  if (!user) return <PublicDashboard />

  const scannedMetrics = metricQueries
    .map((query) => query.data)
    .filter((metrics): metrics is RepoMetrics => Boolean(metrics?.scanId))
  const averageAdoption =
    scannedMetrics.length > 0
      ? scannedMetrics.reduce(
          (sum, metrics) => sum + metrics.adoptionScore,
          0,
        ) / scannedMetrics.length
      : null
  const detectedTools = scannedMetrics.reduce(
    (sum, metrics) => sum + metrics.toolsDetected,
    0,
  )
  const scanCoverage =
    repos.length > 0
      ? Math.round((scannedMetrics.length / repos.length) * 100)
      : 0
  const metricsLoading = metricQueries.some((query) => query.isLoading)
  const stats = [
    {
      label: "Average adoption",
      value: averageAdoption === null ? "—" : averageAdoption.toFixed(1),
      icon: Gauge,
      detail: metricsLoading
        ? "Loading repository metrics"
        : `${scannedMetrics.length} scanned repositories`,
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
          </div>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Workspace</CardTitle>
              <CardDescription>
                Recent changes and shortcuts for this workspace.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">
                  Recently visited
                </p>
                {recentRepositories.length === 0 ? (
                  <p className="py-3 text-sm text-muted-foreground">
                    No repositories visited yet.
                  </p>
                ) : (
                  <div className="divide-y">
                    {recentRepositories.map((repo) => (
                      <Link
                        key={repo.id}
                        to={`/repos/${repo.id}`}
                        className="block py-3 text-sm transition-colors hover:text-primary"
                      >
                        <span className="flex items-center justify-between gap-3 font-medium">
                          <span className="truncate">{repo.fullName}</span>
                          <ArrowRight className="size-4 shrink-0" />
                        </span>
                        <span className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="gap-1">
                            <Star className="size-3" />
                            {repo.stars}
                          </Badge>
                          <Badge variant="secondary" className="gap-1">
                            <Users className="size-3" />
                            {repo.contributorCount} contributors
                          </Badge>
                        </span>
                        <span className="mt-2 block text-xs text-muted-foreground">
                          Added{" "}
                          {formatDistanceToNowStrict(
                            new Date(repo.createdAt),
                            { addSuffix: true },
                          )}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

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
