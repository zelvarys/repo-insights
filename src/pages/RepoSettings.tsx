import { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { Trash2 } from "lucide-react"
import { ErrorState } from "@/components/app/ErrorState"
import { RemoveRepoDialog } from "@/components/app/RemoveRepoDialog"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useRepo } from "@/hooks/useRepoDetail"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function RepoSettings() {
  const { id } = useParams<{ id: string }>()
  const repoId = id && UUID_RE.test(id) ? id : ""
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [removeOpen, setRemoveOpen] = useState(false)
  const repoQuery = useRepo(repoId)
  const repo = repoQuery.data?.repository

  const backTo = repoId ? `/repos/${repoId}` : "/dashboard"

  if (!repoId) {
    return (
      <>
        <PageHeader
          title="Settings"
          description="Manage this repository."
          backTo="/dashboard"
          backLabel="Dashboard"
        />
        <ErrorState
          error={new Error(
            id ? "Invalid repository id." : "Repository id is required."
          )}
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description={
          repo ? `Manage ${repo.fullName}.` : "Manage this repository."
        }
        backTo={backTo}
        backLabel="Back to report"
      />

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
          <CardDescription>
            Removing this repository deletes its scans, metrics, and tool
            settings. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setRemoveOpen(true)}>
            <Trash2 className="size-4" />
            Remove repository
          </Button>
        </CardContent>
      </Card>

      <RemoveRepoDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        repoId={repoId}
        repoName={repo?.fullName}
        onRemoved={() => {
          void queryClient.invalidateQueries({ queryKey: ["repos"] })
          navigate("/dashboard", { replace: true })
        }}
      />
    </>
  )
}
