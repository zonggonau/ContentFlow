"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  DatabaseIcon,
  FileText,
  Puzzle,
  Bot,
  Sparkles,
  Layers,
  ArrowRight,
  ArrowUpRight,
  LayoutDashboard
} from "lucide-react"
import { NestedSidebarHeader } from "@/components/dashboard/nested-sidebar-header"

interface ContentBuilderSidebarProps {
  tenantId: string
}

export function ContentBuilderSidebar({ tenantId }: ContentBuilderSidebarProps) {
  const pathname = usePathname()

  const navItems = [
    { title: "AI Website Builder", href: `/dashboard/${tenantId}/content-type-builder/aiwebsitebuilder`, icon: Bot, badge: "AI" },
    { title: "Collection Types", href: `/dashboard/${tenantId}/content-type-builder/content-types`, icon: DatabaseIcon },
    { title: "Single Types", href: `/dashboard/${tenantId}/content-type-builder/single-types`, icon: FileText },
    { title: "Components", href: `/dashboard/${tenantId}/content-type-builder/components`, icon: Puzzle },
  ]

  return (
    <div className="w-64 border-r border-border/80 bg-card h-full flex flex-col shrink-0 justify-between">
      <div>
        <NestedSidebarHeader 
          tenantId={tenantId} 
          backTooltip="Back to Workspace Dashboard"
          logoHref={`/dashboard/${tenantId}/content-type-builder/content-types`} 
          portalBadge="Schema Builder" 
        />
        <div className="p-3 space-y-1">
          <p className="px-3 mb-2 text-[10px] font-black tracking-widest text-muted-foreground/60 uppercase">
            Schema & Architecture
          </p>
          {navItems.map((item) => {
            const isActive = pathname?.startsWith(item.href)
            
            return (
              <Link key={item.title} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all group",
                    isActive
                      ? "bg-primary text-primary-foreground font-bold shadow-xs"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <item.icon className={cn("h-4 w-4 shrink-0 transition-transform group-hover:scale-105", isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
                  <span className="truncate flex-1">{item.title}</span>
                  {item.badge && (
                    <span className={cn(
                      "text-[9px] px-1.5 py-0.5 rounded-full font-bold",
                      isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                    )}>
                      {item.badge}
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Direct Quick Jump to CMS Studio */}
      <div className="p-3 border-t border-border/80 bg-muted/20 space-y-2">
        <p className="px-1 text-[10px] font-black tracking-widest text-muted-foreground/60 uppercase">
          Quick Navigation
        </p>
        <Link href={`/dashboard/${tenantId}/cms`}>
          <div className="flex items-center gap-2.5 rounded-xl p-2.5 text-xs font-bold transition-all bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/30 group shadow-xs">
            <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 group-hover:rotate-12 transition-transform" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="font-bold">Open CMS Studio</span>
                <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-[10px] text-muted-foreground font-normal truncate mt-0.5">Manage entries & content</p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  )
}
