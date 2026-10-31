import { Link } from "react-router-dom"
import { formatDistanceToNow } from "date-fns"
import { ArrowRight, GitFork, Lock, Star, Users } from "lucide-react"
import type { TrackedRepository } from "@shared/types"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function RepositoryCard({ repo }: { repo: TrackedRepository }) {
  return (
    <Link
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
            {repo.isPrivate ? <Lock className="size-3" /> : null}
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
            View insights
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </CardFooter>
      </Card>
    </Link>
  )
}
