import { useEffect, useState } from 'react'
import { FilePlus2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { IssueDraft } from '@/lib/issue-drafts'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateIssue } from '@/hooks/useRepoActions'

export function CreateIssueDialog({
  repoId,
  draft,
  open,
  onOpenChange,
}: {
  repoId: string
  draft: IssueDraft | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const createIssue = useCreateIssue(repoId)

  useEffect(() => {
    if (!open || !draft) return
    setTitle(draft.title)
    setBody(draft.body)
  }, [draft, open])

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!createIssue.isPending) onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create GitHub issue</DialogTitle>
          <DialogDescription>
            Review the pre-filled finding before creating an issue in this
            repository.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="issue-title">Title</Label>
            <Input
              id="issue-title"
              value={title}
              maxLength={256}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="issue-body">Body</Label>
            <textarea
              id="issue-body"
              value={body}
              rows={12}
              maxLength={65_536}
              onChange={(event) => setBody(event.target.value)}
              className="min-h-56 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={createIssue.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={createIssue.isPending || title.trim().length === 0}
            onClick={() => {
              createIssue.mutate(
                { title: title.trim(), body },
                {
                  onSuccess: ({ issue }) => {
                    toast.success(`Issue #${issue.number} created`, {
                      description: issue.title,
                      action: {
                        label: 'Open',
                        onClick: () =>
                          window.open(
                            issue.url,
                            '_blank',
                            'noopener,noreferrer',
                          ),
                      },
                    })
                    onOpenChange(false)
                  },
                  onError: (error) => {
                    toast.error('Could not create issue', {
                      description: error.message,
                    })
                  },
                },
              )
            }}
          >
            {createIssue.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FilePlus2 className="size-4" />
            )}
            Create issue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
