import { LogOut, Settings } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useAuth } from "@/hooks/useAuth"
import { useLogout } from "@/hooks/useLogout"

export function UserMenu() {
  const { user } = useAuth()
  const logout = useLogout()

  if (!user) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          window.location.href = "/auth/github"
        }}
      >
        Sign in
      </Button>
    )
  }

  const initials = user.username.slice(0, 2).toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-9 gap-2 px-2"
          aria-label="Account menu"
        >
          <Avatar className="size-7">
            {user.avatarUrl ? (
              <AvatarImage src={user.avatarUrl} alt={user.username} />
            ) : null}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-32 truncate text-sm font-medium sm:inline">
            {user.username}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem disabled className="opacity-100">
          <span className="truncate text-xs text-muted-foreground">
            Signed in as {user.username}
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuItem
              aria-disabled="true"
              tabIndex={-1}
              onSelect={(event) => event.preventDefault()}
              className="cursor-not-allowed opacity-50"
            >
              <Settings className="size-4" />
              Settings
            </DropdownMenuItem>
          </TooltipTrigger>
          <TooltipContent side="left">Coming soon</TooltipContent>
        </Tooltip>
        <DropdownMenuItem
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
