import { Github, Loader2, LogOut } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { PageHeader } from "@/components/layout/PageHeader"
import { useAuth } from "@/hooks/useAuth"
import { useLogout } from "@/hooks/useLogout"

export default function Settings() {
  const { user } = useAuth()
  const logout = useLogout()

  if (!user) return null

  const initials = user.username.slice(0, 2).toUpperCase()

  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage your account and session."
      />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>
              You are signed in with GitHub. repositron only reads the
              repositories you connect.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4">
            <Avatar className="size-12">
              {user.avatarUrl ? (
                <AvatarImage src={user.avatarUrl} alt={user.username} />
              ) : null}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-medium">{user.username}</p>
              {user.email ? (
                <p className="truncate text-sm text-muted-foreground">
                  {user.email}
                </p>
              ) : null}
            </div>
            <Button variant="outline" size="sm" className="sm:ml-auto" asChild>
              <a
                href="https://github.com/settings/profile"
                target="_blank"
                rel="noreferrer"
              >
                <Github className="size-4" />
                GitHub profile
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Session</CardTitle>
            <CardDescription>
              Sign out of this browser. You will need to sign in with GitHub
              again to access your repositories.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
            >
              {logout.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LogOut className="size-4" />
              )}
              {logout.isPending ? "Signing out..." : "Sign out"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
