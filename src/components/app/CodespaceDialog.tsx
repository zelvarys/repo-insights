import { Code2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useCreateCodespace } from '@/hooks/useRepoActions'

export function CodespaceDialog({
  repoId,
  repoName,
  open,
  onOpenChange,
}: {
  repoId: string
  repoName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const createCodespace = useCreateCodespace(repoId)

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!createCodespace.isPending) onOpenChange(nextOpen)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Open a GitHub Codespace?</AlertDialogTitle>
          <AlertDialogDescription>
            This creates a new Codespace for {repoName ?? 'this repository'}{' '}
            using your GitHub account and opens it in a new tab.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={createCodespace.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={createCodespace.isPending}
            onClick={(event) => {
              event.preventDefault()
              createCodespace.mutate(undefined, {
                onSuccess: ({ codespace }) => {
                  toast.success('Codespace created', {
                    description: codespace.name,
                  })
                  onOpenChange(false)
                  window.open(codespace.webUrl, '_blank', 'noopener,noreferrer')
                },
                onError: (error) => {
                  toast.error('Could not create Codespace', {
                    description: error.message,
                  })
                },
              })
            }}
          >
            {createCodespace.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Code2 className="size-4" />
            )}
            Create and open
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
