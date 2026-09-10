"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Server, Rocket, Globe, Variable, Database, ArrowRight } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { HostingDeploymentsView } from "./hosting-deployments-view"
import { DatabaseStorageView } from "./database-storage-view"
import { EnvironmentView } from "./environment-view"

type TabKey = "overview" | "hosting" | "domains" | "environment" | "database"

const TABS: { key: TabKey; label: string; icon: typeof Server }[] = [
  { key: "overview", label: "Overview", icon: Server },
  { key: "hosting", label: "Hosting", icon: Rocket },
  { key: "domains", label: "Domains", icon: Globe },
  { key: "environment", label: "Environment", icon: Variable },
  { key: "database", label: "Database & Storage", icon: Database },
]

const OVERVIEW_CARDS: { key: Exclude<TabKey, "overview">; title: string; desc: string; icon: typeof Server }[] = [
  { key: "hosting", title: "Hosting", desc: "Deployment Vercel situs frontend, health-ping, hubungkan URL manual.", icon: Rocket },
  { key: "domains", title: "Domains", desc: "Custom domain (@ / CNAME), verifikasi DNS, domain utama, beli domain.", icon: Globe },
  { key: "environment", title: "Environment", desc: "Variabel yang diteruskan ke build frontend Vercel.", icon: Variable },
  { key: "database", title: "Database & Storage", desc: "PostgreSQL & object storage: shared pool, dedicated appliance, atau BYODB.", icon: Database },
]

function InfrastructureShell() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tenantSlug = params?.tenant as string

  const urlTab = searchParams.get("tab") as TabKey | null
  const [tab, setTab] = useState<TabKey>(
    urlTab && TABS.some((t) => t.key === urlTab) ? urlTab : "overview",
  )

  // Keep ?tab= in the URL so tabs are linkable/shareable and the
  // /deployments and /domains redirects land on the right one.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (tab === "overview") url.searchParams.delete("tab")
    else url.searchParams.set("tab", tab)
    window.history.replaceState({}, "", url.toString())
  }, [tab])

  // Keep the heavy sub-views mounted once visited so their fetched state
  // survives tab switches.
  const [mounted, setMounted] = useState<Record<string, boolean>>({})
  useEffect(() => {
    setMounted((m) => {
      if (tab === "hosting" || tab === "domains") return m.hosting ? m : { ...m, hosting: true }
      if (tab === "environment") return m.environment ? m : { ...m, environment: true }
      if (tab === "database") return m.database ? m : { ...m, database: true }
      return m
    })
  }, [tab])

  const hostingSection = useMemo<"hosting" | "domains">(() => (tab === "domains" ? "domains" : "hosting"), [tab])

  return (
    <div className="flex flex-1 flex-col w-full">
      <div className="p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Server className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-foreground">Hosting &amp; Infrastruktur</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Deployment Vercel, domain, environment, database &amp; storage workspace — dalam satu tempat.
            </p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="rounded-xl h-10 bg-muted/40 p-1 flex-wrap w-full sm:w-auto">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="rounded-lg text-xs font-bold px-3 h-8 gap-1.5">
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="mt-2">
          {tab === "overview" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {OVERVIEW_CARDS.map((c) => (
                <Card
                  key={c.key}
                  onClick={() => setTab(c.key)}
                  className="rounded-2xl border border-border/80 shadow-xs cursor-pointer hover:border-primary/40 transition-colors"
                >
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                        <c.icon className="h-4.5 w-4.5" />
                      </div>
                      <div className="font-bold text-sm text-foreground">{c.title}</div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{c.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Hosting + Domains share one component (single fetch). Kept
              mounted after first visit; its own `visibleSection` shows the
              right half. */}
          <div hidden={tab !== "hosting" && tab !== "domains"}>
            {mounted.hosting && (
              <HostingDeploymentsView
                tenantSlug={tenantSlug}
                visibleSection={hostingSection}
                onNavigate={(t) => setTab(t as TabKey)}
              />
            )}
          </div>

          <div hidden={tab !== "environment"}>
            {mounted.environment && <EnvironmentView tenantSlug={tenantSlug} />}
          </div>

          <div hidden={tab !== "database"}>
            {mounted.database && <DatabaseStorageView tenantSlug={tenantSlug} />}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TenantInfrastructurePage() {
  return (
    <Suspense
      fallback={
        <div className="p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-10 w-full max-w-md rounded-xl" />
          <Skeleton className="h-56 w-full rounded-2xl" />
        </div>
      }
    >
      <InfrastructureShell />
    </Suspense>
  )
}
