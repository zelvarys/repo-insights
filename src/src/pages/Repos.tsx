import { FolderGit2, Github } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PageHeader } from "@/components/layout/PageHeader"

export default function Repos() {
  return (
    <>
      <PageHeader
        title="Repositories"
        description="Repositories you have connected to repo-insights."
        actions={
          <Button asChild>
            <a href="/auth/github">
              <Github className="size-4" />
              Connect GitHub
            </a>
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <FolderGit2 className="size-6" />
          </div>
          <h2 className="text-lg font-semibold">No repositories yet</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Connect your GitHub account to choose the repositories you want to
            track.
          </p>
          <Button asChild className="mt-2">
            <a href="/auth/github">
              <Github className="size-4" />
              Connect GitHub
            </a>
          </Button>
        </CardContent>
      </Card>
    </>
  )
}
