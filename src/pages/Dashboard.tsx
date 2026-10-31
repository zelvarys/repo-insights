import { useState } from "react"
import { Link } from "react-router-dom"
import {
  Activity,
  ArrowRight,
  FolderGit2,
  Github,
  Package,
  Plus,
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
import { RepositoryCard } from "@/components/app/RepositoryCard"
import { StatCard } from "@/components/app/StatCard"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useAuth } from "@/hooks/useAuth"
import { useRepos } from "@/hooks/useRepos"
import { recentRepoIds } from "@/lib/recent-repos"

const introFeatures = [
  {
    title: "Repository health",
    description:
      "Activity, dependencies, workflows, and commit quality in one score.",
    icon: ShieldCheck,
  },
  {
    title: "Commit activity",
    description:
      "See cadence, contributor mix, and the messages that need work.",
    icon: Activity,
  },
  {
    title: "Dependencies",
    description:
      "Direct manifest dependencies with outdated and advisory checks.",
    icon: Package,
  },
  {
    title: "Workflows & tools",
    description:
      "GitHub Actions reliability alongside per-tool contributor adoption.",
    icon: Workflow,
  },
]

function signIn() {
  window.location.href = "/auth/github"
}

function PublicDashboard() {
  return (
    <div className="mx-auto max-w-4xl py-6 sm:py-12">
      <div className="text-center">
        <Badge variant="secondary" className="mb-5 gap-1.5">
          <Wrench className="size-3" />
          Repository insights for maintainers
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-5xl">
          See how healthy your repositories really are.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-balance text-muted-foreground sm:text-lg">
          Connect GitHub to scan repository health, activity, dependencies,
          workflows, structure, and how consistently contributors use your
          tools.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <Button size="lg" onClick={signIn}>
            <Github className="size-4" />
            Connect GitHub
          </Button>
          <p className="text-xs text-muted-foreground">
            Read-only access. Public repositories only.
          </p>
        </div>
      </div>

      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        {introFeatures.map((feature) => (
          <Card key={feature.title}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <feature.icon className="size-4" />
                </div>
                <CardTitle className="text-sm">{feature.title}</CardTitle>
              </div>
              <CardDescription>{feature.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="mt-8 text-center">
        <Button onClick={signIn}>
          <Github className="size-4" />
          Sign in with GitHub
        </Button>
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

  const stats = [
    {
      label: "Repositories",
      value: repos.length,
      icon: FolderGit2,
    },
    {
      label: "Contributors",
      value: repos.reduce((sum, repo) => sum + repo.contributorCount, 0),
      icon: Users,
    },
    {
      label: "Stars",
      value: repos.reduce((sum, repo) => sum + repo.stars, 0),
      icon: Star,
    },
  ]

  const sortedRepos = [...repos].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  )
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
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {stats.map((stat) => (
              <StatCard
                key={stat.label}
                label={stat.label}
                value={stat.value}
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
      )}
    </>
  )
}
