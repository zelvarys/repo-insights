import { FolderGit2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { PageHeader } from "@/components/layout/PageHeader"

export default function Repos() {
  return (
    <>
      <PageHeader
        title="Repositories"
        description="Repositories you have connected to repo-insights."
      />

      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <FolderGit2 className="size-6" />
          </div>
          <h2 className="text-lg font-semibold">No repositories yet</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Repository management will be available in the next phase.
          </p>
        </CardContent>
      </Card>
    </>
  )
}
