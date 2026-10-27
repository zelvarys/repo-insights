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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { useAddRepo, useGitHubRepos } from "@/hooks/useRepos"
import { cn } from "@/lib/utils"
import type { GitHubRepo } from "@/types/local"

type AddRepoDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function RepoRow({
  repo,
  disabled,
  active,
  onSelect,
  onHover,
}: {
  repo: GitHubRepo
  disabled: boolean
  active: boolean
  onSelect: (repo: GitHubRepo) => void
  onHover: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      id={`add-repo-option-${repo.id}`}
      disabled={disabled}
      onClick={() => onSelect(repo)}
      onMouseEnter={onHover}
      className={cn(
        "h-auto w-full justify-start gap-3 rounded-md px-3 py-3 text-left",
        active && "bg-accent text-accent-foreground",
      )}
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
  const [activeIndex, setActiveIndex] = useState(0)
  const githubRepos = useGitHubRepos()
  const addRepo = useAddRepo()

  useEffect(() => {
    if (!open) {
      setSearch("")
      setActiveIndex(0)
    }
  }, [open])

  const query = search.trim().toLowerCase()
  const repos =
    githubRepos.data?.pages
      .flatMap((page) => page.repos)
      .filter((repo) => repo.full_name.toLowerCase().includes(query)) ?? []

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    if (activeIndex >= repos.length) {
      setActiveIndex(Math.max(0, repos.length - 1))
    }
  }, [activeIndex, repos.length])

  function handleSelect(repo: GitHubRepo) {
    if (addRepo.isPending) return
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
            Choose one of your GitHub repositories or one you have contributed
            to in the last 12 months.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (repos.length === 0) return
              if (event.key === "ArrowDown") {
                event.preventDefault()
                setActiveIndex((index) => (index + 1) % repos.length)
              } else if (event.key === "ArrowUp") {
                event.preventDefault()
                setActiveIndex(
                  (index) => (index - 1 + repos.length) % repos.length,
                )
              } else if (event.key === "Enter") {
                const repo = repos[activeIndex]
                if (repo) {
                  event.preventDefault()
                  handleSelect(repo)
                }
              }
            }}
            placeholder="Search repositories..."
            className="pl-9"
            aria-label="Search GitHub repositories"
            aria-controls="add-repo-list"
            aria-activedescendant={
              repos[activeIndex]
                ? `add-repo-option-${repos[activeIndex].id}`
                : undefined
            }
          />
        </div>

        <ScrollArea className="h-80 pr-1" id="add-repo-list">
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
                  : "No owned, collaborative, or contributed repositories were found."}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {repos.map((repo, index) => (
                <RepoRow
                  key={repo.id}
                  repo={repo}
                  disabled={addRepo.isPending}
                  active={index === activeIndex}
                  onSelect={handleSelect}
                  onHover={() => setActiveIndex(index)}
                />
              ))}
              {githubRepos.hasNextPage ? (
                <div className="pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={githubRepos.isFetchingNextPage}
                    onClick={() => githubRepos.fetchNextPage()}
                  >
                    {githubRepos.isFetchingNextPage ? "Loading..." : "Load more"}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
