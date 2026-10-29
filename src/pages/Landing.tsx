import { useEffect } from "react"
import type { RepoMetrics, ToolCategory } from "@shared/types"
import { Link, useNavigate } from "react-router-dom"
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  FlaskConical,
  Github,
  GitBranch,
  Package,
  ScanSearch,
  Sparkles,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { queryClient } from "@/lib/query-client"
import { useAuthStore } from "@/store/auth"

function startGithubLogin() {
  window.location.href = "/auth/github"
}

const steps = [
  {
    icon: Github,
    title: "Connect GitHub",
    description:
      "Authorise repo-insights with your GitHub account and pick the repositories you want to track.",
  },
  {
    icon: ScanSearch,
    title: "Scan your history",
    description:
      "We check your recent commits against 13 common testing, linting, CI, and dependency tools.",
  },
  {
    icon: BarChart3,
    title: "See real adoption",
    description:
      "Get a clear score, per-tool adoption, and the contributors who still need a nudge.",
  },
]

const toolGroups: {
  category: ToolCategory
  label: string
  icon: LucideIcon
  tools: string[]
}[] = [
  {
    category: "testing",
    label: "Testing",
    icon: FlaskConical,
    tools: ["Jest", "Pytest", "Go test", "PHPUnit"],
  },
  {
    category: "linting",
    label: "Linting & formatting",
    icon: Wrench,
    tools: ["ESLint", "Prettier", "Black", "Ruff", "golangci-lint", "pre-commit"],
  },
  {
    category: "ci_cd",
    label: "CI/CD",
    icon: Workflow,
    tools: ["GitHub Actions"],
  },
  {
    category: "dependencies",
    label: "Dependencies",
    icon: Package,
    tools: ["Dependabot", "Renovate"],
  },
]

const sampleMetrics: RepoMetrics = {
  repoId: "sample-repo",
  repoFullName: "acme/payments-api",
  scanId: "sample-scan",
  scanCompletedAt: "2026-10-24T09:30:00.000Z",
  adoptionScore: 78,
  coverage: 84,
  adoption: 93,
  languages: ["TypeScript", "Python"],
  toolsChecked: 13,
  toolsRelevant: 8,
  toolsTracked: 6,
  toolsDetected: 6,
  tools: [
    {
      name: "jest",
      category: "testing",
      detected: true,
      relevant: true,
      tracked: true,
      adoptionRate: 92,
      contributorCount: 12,
      contributorsUsing: 11,
      countsTowardScore: true,
      evidence: null,
    },
    {
      name: "pytest",
      category: "testing",
      detected: true,
      relevant: true,
      tracked: true,
      adoptionRate: 88,
      contributorCount: 12,
      contributorsUsing: 10,
      countsTowardScore: true,
      evidence: null,
    },
    {
      name: "eslint",
      category: "linting",
      detected: true,
      relevant: true,
      tracked: true,
      adoptionRate: 95,
      contributorCount: 12,
      contributorsUsing: 11,
      countsTowardScore: true,
      evidence: null,
    },
    {
      name: "prettier",
      category: "linting",
      detected: true,
      relevant: true,
      tracked: true,
      adoptionRate: 90,
      contributorCount: 12,
      contributorsUsing: 10,
      countsTowardScore: true,
      evidence: null,
    },
    {
      name: "github-actions",
      category: "ci_cd",
      detected: true,
      relevant: true,
      tracked: true,
      adoptionRate: 100,
      contributorCount: 12,
      contributorsUsing: 12,
      countsTowardScore: false,
      evidence: null,
    },
    {
      name: "dependabot",
      category: "dependencies",
      detected: true,
      relevant: true,
      tracked: true,
      adoptionRate: 92,
      contributorCount: 12,
      contributorsUsing: 11,
      countsTowardScore: true,
      evidence: null,
    },
  ],
}

const faqs = [
  {
    question: "What counts as tool adoption?",
    answer:
      "For each tracked tool, we look at whether contributors are using it in their commits. The score combines how many tracked tools are detected with how widely each one is adopted.",
  },
  {
    question: "Which tools are supported?",
    answer:
      "Jest, Pytest, Go test, PHPUnit, ESLint, Prettier, Black, Ruff, golangci-lint, pre-commit, GitHub Actions, Dependabot, and Renovate.",
  },
  {
    question: "Does repo-insights change my repository?",
    answer:
      "No. It reads repository and commit data through the GitHub API. You can sign out of the app at any time.",
  },
  {
    question: "Can I choose which tools count?",
    answer:
      "Yes. Repository settings let you enable or disable tracked tools, so the score reflects the standards your team actually cares about.",
  },
  {
    question: "How often does it scan?",
    answer:
      "Scans run on demand. Each report is tied to a specific scan, so you can compare results over time.",
  },
]

function SampleScoreGauge({ score }: { score: number }) {
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  return (
    <div className="relative size-40">
      <svg
        viewBox="0 0 128 128"
        className="size-full -rotate-90"
        role="img"
        aria-label={`Adoption score ${score} out of 100`}
      >
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          strokeWidth="10"
          className="stroke-border"
        />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="stroke-primary"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tracking-tight">{score}</span>
        <span className="text-xs text-muted-foreground">out of 100</span>
      </div>
    </div>
  )
}

function SampleStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  )
}

function ProgressRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{value}%</span>
      </div>
      <Progress value={value} />
    </div>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("auth") === "ok") {
      window.history.replaceState({}, "", "/")
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] })
    }
  }, [])

  useEffect(() => {
    if (user) {
      navigate("/dashboard", { replace: true })
    }
  }, [user, navigate])

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <GitBranch className="size-5" />
            repo-insights
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <a href="#how-it-works">How it works</a>
            </Button>
            <Button onClick={startGithubLogin}>
              <Github className="size-4" />
              Connect GitHub
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="border-b">
          <div className="mx-auto flex max-w-6xl flex-col items-center px-6 py-24 text-center sm:py-32">
            <Badge variant="secondary" className="mb-6 gap-1.5">
              <Sparkles className="size-3" />
              Tool adoption tracking for maintainers
            </Badge>
            <h1 className="max-w-4xl text-4xl font-bold tracking-tight text-balance sm:text-6xl">
              Find out if your contributors are actually using the tools you
              told them to.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-balance text-muted-foreground">
              repo-insights scans your repositories, checks recent commits, and
              shows you who is using the tools your team standardised on — plus
              activity, dependency health, CI stability, structure, and commit
              quality.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {["Tool adoption", "Activity", "Dependencies", "CI", "Structure", "Commit quality"].map(
                (feature) => (
                  <Badge key={feature} variant="outline">
                    {feature}
                  </Badge>
                )
              )}
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={startGithubLogin}>
                <Github className="size-4" />
                Connect GitHub
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href="#sample">
                  See a sample report
                  <ArrowRight className="size-4" />
                </a>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Works with public GitHub repositories.
            </p>
          </div>
        </section>

        <section id="how-it-works" className="border-b">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                From zero to a clear picture
              </h2>
              <p className="mt-3 text-muted-foreground">
                Three steps. No CI changes, no new dashboards to maintain.
              </p>
            </div>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {steps.map((step, index) => (
                <Card key={step.title} className="p-6">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <step.icon className="size-5" />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">
                      Step {index + 1}
                    </span>
                  </div>
                  <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {step.description}
                  </p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="tools" className="border-b bg-muted/30">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-2xl">
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  13 tools. One adoption score.
                </h2>
                <p className="mt-3 text-muted-foreground">
                  We check the tools your team already uses, across the
                  languages you work in.
                </p>
              </div>
              <Badge variant="outline" className="w-fit">
                More tools coming
              </Badge>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {toolGroups.map((group) => (
                <Card key={group.category}>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <group.icon className="size-4 text-muted-foreground" />
                      <CardTitle className="text-base">{group.label}</CardTitle>
                      <Badge variant="secondary" className="ml-auto">
                        {group.tools.length}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {group.tools.map((tool) => (
                        <Badge key={tool} variant="outline">
                          {tool}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="sample" className="border-b">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="mx-auto max-w-2xl text-center">
              <Badge variant="secondary" className="mb-3">
                Sample report
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                A score your team can act on
              </h2>
              <p className="mt-3 text-muted-foreground">
                See adoption at a glance, then explore activity, dependencies,
                CI stability, structure, and the contributors behind the number.
              </p>
            </div>
            <Card className="mx-auto mt-10 max-w-4xl overflow-hidden">
              <CardHeader className="border-b">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      {sampleMetrics.repoFullName}
                    </CardTitle>
                    <CardDescription>
                      Sample scan · {sampleMetrics.languages.join(", ")}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="w-fit">
                    {sampleMetrics.adoptionScore} / 100 adoption
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-8 p-6 lg:grid-cols-[200px_1fr]">
                <div className="flex flex-col items-center justify-center gap-3">
                  <SampleScoreGauge score={sampleMetrics.adoptionScore} />
                  <p className="text-center text-xs text-muted-foreground">
                    Weighted across tracked tools
                  </p>
                </div>
                <div className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <SampleStat
                      label="Tools detected"
                      value={`${sampleMetrics.toolsDetected}/${sampleMetrics.toolsChecked}`}
                    />
                    <SampleStat
                      label="Tracked tools"
                      value={String(sampleMetrics.toolsTracked)}
                    />
                    <SampleStat label="Contributors" value="12" />
                  </div>
                  <Separator />
                  <div className="space-y-4">
                    <ProgressRow label="Adoption" value={sampleMetrics.adoption} />
                    <ProgressRow label="Coverage" value={sampleMetrics.coverage} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {sampleMetrics.tools.slice(0, 4).map((tool) => (
                      <Badge
                        key={tool.name}
                        variant={tool.detected ? "secondary" : "outline"}
                        className="gap-1.5"
                      >
                        {tool.detected ? (
                          <CheckCircle2 className="size-3" />
                        ) : null}
                        {tool.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="faq" className="border-b">
          <div className="mx-auto max-w-3xl px-6 py-20">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Questions, answered
            </h2>
            <div className="mt-8 divide-y rounded-xl border">
              {faqs.map((faq) => (
                <details key={faq.question} className="group px-5 py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
                    {faq.question}
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <GitBranch className="size-4" />
            repo-insights
          </div>
          <nav className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <a href="#how-it-works" className="hover:text-foreground">
              How it works
            </a>
            <a href="#tools" className="hover:text-foreground">
              Tools
            </a>
            <a href="#sample" className="hover:text-foreground">
              Sample report
            </a>
            <a href="#faq" className="hover:text-foreground">
              FAQ
            </a>
            <Link to="/dashboard" className="hover:text-foreground">
              Dashboard
            </Link>
          </nav>
          <p className="text-xs text-muted-foreground">
            Built for maintainers.
          </p>
        </div>
      </footer>
    </div>
  )
}
