import { Link } from "react-router-dom"
import { formatDistanceToNowStrict } from "date-fns"
import { ArrowUpRight, GitBranch, GitFork, Star, Users } from "lucide-react"
import type { TrackedRepository } from "@shared/types"

export function RepositoryCard({ repo }: { repo: TrackedRepository }) {
  const initials = repo.name.slice(0, 2).toUpperCase()

  return (
    <Link
      to={`/repos/${repo.id}`}
      className="group block h-full rounded-xl border bg-card text-card-foreground shadow-sm transition-colors hover:border-foreground/25 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted font-mono text-xs font-semibold tracking-wide text-muted-foreground"
            >
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs text-muted-foreground">
                {repo.owner}
              </p>
              <h3 className="truncate text-base font-semibold tracking-tight">
                {repo.name}
              </h3>
            </div>
          </div>
          <ArrowUpRight
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground"
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span
            className="inline-flex items-center gap-1.5"
            aria-label={`${repo.stars} stars`}
          >
            <Star className="size-3.5" aria-hidden="true" />
            {repo.stars.toLocaleString()}
          </span>
          <span
            className="inline-flex items-center gap-1.5"
            aria-label={`${repo.forks} forks`}
          >
            <GitFork className="size-3.5" aria-hidden="true" />
            {repo.forks.toLocaleString()}
          </span>
          <span
            className="inline-flex items-center gap-1.5"
            aria-label={`${repo.contributorCount} contributors`}
          >
            <Users className="size-3.5" aria-hidden="true" />
            {repo.contributorCount.toLocaleString()}
          </span>
        </div>

        <div className="mt-auto pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <GitBranch className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate font-mono text-[11px]">
                {repo.defaultBranch}
              </span>
            </span>
            <span className="shrink-0">
              Added{" "}
              {formatDistanceToNowStrict(new Date(repo.createdAt), {
                addSuffix: true,
              })}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
