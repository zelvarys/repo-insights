import { useParams } from "react-router-dom"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { PageHeader } from "@/components/layout/PageHeader"

export default function RepoSettings() {
  const { id } = useParams<{ id: string }>()
  const backTo = id ? `/repos/${id}` : "/repos"

  return (
    <>
      <PageHeader
        title="Repository settings"
        description="Repository"
        backTo={backTo}
        backLabel={id ? "Back to report" : "Repositories"}
      />

      <Card>
        <CardHeader>
          <CardTitle>Tracked tools</CardTitle>
          <CardDescription>
            Choose which tools count toward this repository&apos;s adoption
            score.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Tool settings will be available in a later phase.
          </p>
        </CardContent>
      </Card>
    </>
  )
}
