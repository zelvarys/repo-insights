import { useEffect, useState } from "react"
import { Lock, Search, Star } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useAddRepo, useGitHubRepos } from "@/hooks/useRepos"
import type { GitHubRepo } from "@/types/local"

type AddRepoDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function RepoRow({
  repo,
  disabled,
  onSelect,
}: {
  repo: GitHubRepo
  disabled: boolean
  onSelect: (repo: GitHubRepo) => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={disabled}
      onClick={() => onSelect(repo)}
      className="h-auto w-full justify-start gap-3 rounded-md px-3 py-3 text-left"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{repo.full_name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {repo.default_branch}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {repo.private ? (
          <Badge variant="outline" className="gap-1">
            <Lock className="size-3" />
            Private
          </Badge>
        ) : null}
        <Badge variant="secondary" className="gap-1">
          <Star className="size-3" />
          {repo.stargazers_count}
        </Badge>
      </div>
    </Button>
  )
}

export function AddRepoDialog({ open, onOpenChange }: AddRepoDialogProps) {
  const [search, setSearch] = useState("")
  const githubRepos = useGitHubRepos()
  const addRepo = useAddRepo()

  useEffect(() => {
    if (!open) setSearch("")
  }, [open])

  const query = search.trim().toLowerCase()
  const repos =
    githubRepos.data?.repos.filter((repo) =>
      repo.full_name.toLowerCase().includes(query)
    ) ?? []

  function handleSelect(repo: GitHubRepo) {
    addRepo.mutate(repo.id, {
      onSuccess: ({ repository }) => {
        toast.success("Repository added", {
          description: repository.fullName,
        })
        onOpenChange(false)
      },
      onError: (error) => {
        toast.error("Could not add repository", {
          description: error.message,
        })
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add repository</DialogTitle>
          <DialogDescription>
            Choose a GitHub repository to track with repo-insights.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search repositories..."
            className="pl-9"
            aria-label="Search GitHub repositories"
          />
        </div>

        <div className="max-h-80 overflow-y-auto pr-1">
          {githubRepos.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-3 rounded-md px-3 py-3"
                >
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          ) : githubRepos.isError ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Could not load your GitHub repositories.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => githubRepos.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : repos.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm font-medium">
                {query ? "No matching repositories" : "No repositories found"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {query
                  ? "Try a different search term."
                  : "You do not have any GitHub repositories available to track."}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {repos.map((repo) => (
                <RepoRow
                  key={repo.id}
                  repo={repo}
                  disabled={addRepo.isPending}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
