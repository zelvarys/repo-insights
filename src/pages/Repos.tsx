import { useState } from "react"
import { FolderGit2, Plus } from "lucide-react"
import { AddRepoDialog } from "@/components/app/AddRepoDialog"
import { EmptyState } from "@/components/app/EmptyState"
import { ErrorState } from "@/components/app/ErrorState"
import { ReposSkeleton } from "@/components/app/LoadingSkeletons"
import { RepositoryCard } from "@/components/app/RepositoryCard"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {repos.map((repo) => (
            <RepositoryCard key={repo.id} repo={repo} />
          ))}
        </div>
      )}
    </>
  )
}
