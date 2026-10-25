import { useState } from "react"
import { Link } from "react-router-dom"
import { formatDistanceToNow } from "date-fns"
import {
  ArrowRight,
  FolderGit2,
  GitFork,
  Lock,
  Plus,
  Star,
  Users,
} from "lucide-react"
import { AddRepoDialog } from "@/components/app/AddRepoDialog"
import { EmptyState } from "@/components/app/EmptyState"
import { ErrorState } from "@/components/app/ErrorState"
import { ReposSkeleton } from "@/components/app/LoadingSkeletons"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useRepos } from "@/hooks/useRepos"

export default function Repos() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const reposQuery = useRepos()
  const repos = reposQuery.data?.repositories ?? []

  return (
    <>
      <PageHeader
        title="Repositories"
        description="Repositories you have connected to repo-insights."
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
          title="No repos yet"
          description="Connect a GitHub repository to start tracking tool adoption."
          action={
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" />
              Add repository
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {repos.map((repo) => (
            <Link
              key={repo.id}
              to={`/repos/${repo.id}`}
              className="group block h-full rounded-xl focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Card className="h-full transition-colors group-hover:border-primary/50 group-hover:shadow-sm">
                <CardHeader>
                  <CardTitle className="truncate">{repo.fullName}</CardTitle>
                  <CardDescription className="truncate">
                    Default branch: {repo.defaultBranch}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Badge
                    variant={repo.isPrivate ? "outline" : "secondary"}
                    className="gap-1"
                  >
                    {repo.isPrivate ? (
                      <Lock className="size-3" />
                    ) : null}
                    {repo.isPrivate ? "Private" : "Public"}
                  </Badge>
                  <Badge variant="secondary" className="gap-1">
                    <Star className="size-3" />
                    {repo.stars}
                  </Badge>
                  <Badge variant="secondary" className="gap-1">
                    <Users className="size-3" />
                    {repo.contributorCount} contributors
                  </Badge>
                  <Badge variant="secondary" className="gap-1">
                    <GitFork className="size-3" />
                    {repo.forks}
                  </Badge>
                </CardContent>
                <CardFooter className="mt-auto flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    Added{" "}
                    {formatDistanceToNow(new Date(repo.createdAt), {
                      addSuffix: true,
                    })}
                  </span>
                  <span className="inline-flex items-center gap-1 font-medium text-foreground">
                    View report
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
