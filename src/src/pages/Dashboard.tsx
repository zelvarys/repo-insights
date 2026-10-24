import { Link } from "react-router-dom"
import { BarChart3, FolderGit2, ScanLine } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { PageHeader } from "@/components/layout/PageHeader"

const stats = [
  {
    label: "Tracked repositories",
    value: "—",
    icon: FolderGit2,
  },
  {
    label: "Scans completed",
    value: "—",
    icon: ScanLine,
  },
  {
    label: "Average adoption",
    value: "—",
    icon: BarChart3,
  },
]

export default function Dashboard() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="A quick view of adoption across your tracked repositories."
        actions={
          <Button asChild>
            <Link to="/app/repos">
              <FolderGit2 className="size-4" />
              Repositories
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>No scans yet</CardTitle>
          <CardDescription>
            Connect a repository and run your first scan to see adoption
            insights here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/app/repos">Go to repositories</Link>
          </Button>
        </CardContent>
      </Card>
    </>
  )
}
