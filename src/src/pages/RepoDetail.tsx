import { Link, useParams } from "react-router-dom"
import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PageHeader } from "@/components/layout/PageHeader"

export default function RepoDetail() {
  const { id } = useParams<{ id: string }>()

  return (
    <>
      <PageHeader
        title="Repository"
        description="Adoption report for this repository."
        backTo="/repos"
        backLabel="Repositories"
        actions={
          id ? (
            <Button variant="outline" asChild>
              <Link to={`/repos/${id}/settings`}>
                <Settings className="size-4" />
                Settings
              </Link>
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <h2 className="text-lg font-semibold">Report coming soon</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            The full adoption report, tool breakdown, and contributor details
            will appear here.
          </p>
        </CardContent>
      </Card>
    </>
  )
}
