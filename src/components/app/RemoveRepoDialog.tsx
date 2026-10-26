import { Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button"
import { useDeleteRepo } from "@/hooks/useDeleteRepo"

type RemoveRepoDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  repoId: string
  repoName?: string
  onRemoved: () => void
}

export function RemoveRepoDialog({
  open,
  onOpenChange,
  repoId,
  repoName,
  onRemoved,
}: RemoveRepoDialogProps) {
  const deleteRepo = useDeleteRepo()

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!deleteRepo.isPending) onOpenChange(nextOpen)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Remove {repoName ?? "this repository"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Remove this repository? All scan history, metrics, and tracked
            tool settings will be permanently deleted. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteRepo.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "destructive" })}
            disabled={deleteRepo.isPending}
            onClick={(event) => {
              event.preventDefault()
              deleteRepo.mutate(repoId, {
                onSuccess: () => {
                  toast.success("Repository removed")
                  onOpenChange(false)
                  onRemoved()
                },
                onError: (error) => {
                  toast.error("Could not remove repository", {
                    description: error.message,
                  })
                },
              })
            }}
          >
            {deleteRepo.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            Remove repository
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
