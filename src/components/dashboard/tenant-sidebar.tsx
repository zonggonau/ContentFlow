"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { checkWorkspaceAccessAction } from "@/actions/tenant"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  LayoutDashboard,
  FileText,
  Users,
  Settings,
  ImageIcon,
  Moon,
  Sun,
  LogOut,
  Menu,
  X,
  Webhook,
  Key,
  Layers,
  CreditCard,
  ChevronDown,
  Play,
  BookOpen,
  ClipboardList,
  Sparkles,
  ChevronRight,
  Database,
  DatabaseIcon,
  Puzzle,
  Shield,
  Code,
  Server,
  Lock,
  Headphones,
  UserCheck,
  ShieldCheck,
  Rocket,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useState, useEffect, useMemo } from "react"
import { signOut } from "next-auth/react"
import { ProfileModal } from "@/components/dashboard/profile-modal"

/** Sidebar copy — English UI. */
const s = {
  groupContent: "CONTENT",
  groupManagement: "MANAGEMENT",
  groupSettings: "SETTINGS",
  overview: "Overview",
  cmsStudio: "CMS Content Studio",
  contentTypeBuilder: "Content-Type Builder",
  mediaLibrary: "Media Library",
  support: "Support & Help Desk",
  teamMembers: "Team Members",
  appMembers: "End-User Members",
  memberRoles: "Member Roles & Access",
  auditLog: "Activity Log",
  subscriptions: "Plans & Billing",
  deployments: "Hosting & Deployments",
  infrastructure: "Hosting & Infrastruktur",
  developer: "Developer & API",
  workspaceSettings: "Workspace Settings",
  switchWorkspace: "Switch Workspace",
  signOut: "Sign Out",
  badgeNew: "NEW",
  badgeActivate: "ACTIVATE",
} as const

interface TenantSidebarProps {
  tenantId?: string
  tenantSlug?: string
  tenants?: Array<{ id: string; slug: string; name: string; role: string }>
  isEnterpriseMode?: boolean
  isExpired?: boolean
  hasDedicatedInfra?: boolean
  session?: any
}

interface NavItem {
  title: string
  href?: string
  icon: React.ElementType
  badge?: string
  indent?: boolean
  matchPrefix?: boolean
  target?: string
  children?: {
    title: string
    href: string
    icon: React.ElementType
    matchPrefix?: boolean
  }[]
}

interface NavSection {
  label: string
  items: NavItem[]
}

export function TenantSidebar({ tenantId: propId, tenantSlug, tenants, isEnterpriseMode, isExpired, hasDedicatedInfra, session }: TenantSidebarProps) {
  const tenantId = propId || tenantSlug
  const pathname = usePathname()
  const router = useRouter()
  const { toast } = useToast()
  const { theme, setTheme } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [workspaceSwitcherOpen, setWorkspaceSwitcherOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({})
  const [liveTenants, setLiveTenants] = useState<any[]>([])
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [unreadSupportCount, setUnreadSupportCount] = useState(0)

  const handleSwitchWorkspace = async (targetTenantId?: string) => {
    if (targetTenantId && targetTenantId === tenantId) {
      setWorkspaceSwitcherOpen(false)
      setMobileOpen(false)
      return
    }

    const res = await checkWorkspaceAccessAction(targetTenantId)
    if (res.allowed && res.redirectUrl) {
      setWorkspaceSwitcherOpen(false)
      setMobileOpen(false)
      router.push(res.redirectUrl)
    } else if (res.error) {
      toast({ variant: "destructive", title: "Akses Ditolak", description: res.error })
    }
  }

  useEffect(() => {
    setMounted(true)

    const fetchUnread = async () => {
      if (!tenantId) return
      try {
        const res = await fetch(`/api/support/unread-count?tenant=${tenantId}`)
        if (res.ok) {
          const data = await res.json()
          setUnreadSupportCount(data.unreadCount || 0)
        }
      } catch {}
    }
    fetchUnread()
    const interval = setInterval(fetchUnread, 8000)
    return () => clearInterval(interval)
  }, [tenantId])

  const currentTenant = liveTenants.length > 0 
    ? liveTenants.find((t) => t.id === tenantId || t.slug === tenantId) 
    : (session?.user?.tenants || []).find((t: any) => 
        t.id === tenantId || 
        t.slug === tenantId || 
        t.tenantId === tenantId || 
        t.tenant?.id === tenantId ||
        t.tenant?.slug === tenantId
      )

  const href = (path: string) => {
    if (path === "/cms-redirect") return `/dashboard/${tenantId}/cms`
    return `/dashboard/${tenantId}${path}`
  }

  const isActive = (item: { href?: string, matchPrefix?: boolean }) => {
    if (!item.href) return false;
    const fullPath = href(item.href)
    if (item.matchPrefix) return pathname?.startsWith(fullPath)
    return pathname === fullPath
  }

  const toggleMenu = (title: string) => {
    setOpenMenus((prev) => ({ ...prev, [title]: !prev[title] }))
  }

  // Fetch live list of user's tenants
  const userId = session?.user?.id
  useEffect(() => {
    async function fetchTenants() {
      try {
        const res = await fetch("/api/tenants")
        if (res.ok) {
          const data = await res.json()
          setLiveTenants(data.tenants || [])
        }
      } catch (error) {
        console.error("Failed to fetch tenants:", error)
      }
    }
    if (userId) fetchTenants()
  }, [userId])

  const userRole = currentTenant?.role || "subscriber"
  const isSuperAdmin = session?.user?.role === "super_admin"
  const isAdmin = userRole === "admin" || userRole === "owner" || isSuperAdmin
  const isEditor = userRole === "editor" || isAdmin

  const effectiveHasDedicatedInfra = hasDedicatedInfra ?? Boolean(
    currentTenant?.hasDedicatedInfra ||
    currentTenant?.databaseUrl ||
    currentTenant?.plan?.toLowerCase().includes("vps") ||
    currentTenant?.plan?.toLowerCase().includes("dedicated") ||
    currentTenant?.plan?.toLowerCase().includes("enterprise") ||
    isEnterpriseMode
  )

  const navSections: NavSection[] = useMemo(() => [
    {
      label: "",
      items: [
        { title: s.overview, href: "", icon: LayoutDashboard },
      ],
    },
    {
      label: s.groupContent,
      items: [
        { title: s.cmsStudio, href: "/cms-redirect", icon: Sparkles, badge: "STUDIO" },
        ...(isAdmin ? [{
          title: s.contentTypeBuilder,
          href: isExpired ? "/content-type-builder" : "/content-type-builder/content-types",
          icon: DatabaseIcon,
          matchPrefix: true
        }] : []),
        ...(isEditor || userRole === "author" ? [{ title: s.mediaLibrary, href: "/media", icon: ImageIcon }] : []),
      ],
    },
    {
      label: s.groupManagement,
      items: [
        {
          title: s.support,
          href: "/support",
          icon: Headphones,
          matchPrefix: true,
          badge: unreadSupportCount > 0 ? `${unreadSupportCount} ${s.badgeNew}` : undefined
        },
        ...(isAdmin ? [
          { title: s.teamMembers, href: "/users", icon: Users },
          { title: s.appMembers, href: "/users-permissions/members", icon: UserCheck, matchPrefix: true },
          { title: s.memberRoles, href: "/users-permissions/roles", icon: ShieldCheck, matchPrefix: true },
        ] : []),
        ...(isAdmin || isEditor ? [{ title: s.auditLog, href: "/system/audit", icon: ClipboardList }] : []),
        ...(isAdmin && !isEnterpriseMode ? [{
          title: s.subscriptions,
          href: "/subscriptions",
          icon: CreditCard,
          matchPrefix: true,
          badge: isExpired ? s.badgeActivate : undefined
        }] : []),
      ],
    },
    {
      label: s.groupSettings,
      items: [
        ...(isAdmin ? [
          {
            title: s.infrastructure,
            href: "/infrastructure",
            icon: Rocket,
            matchPrefix: true,
            badge: effectiveHasDedicatedInfra ? "VPS" : "VERCEL"
          },
          { title: s.developer, href: "/developer", icon: Code, matchPrefix: true },
          { title: s.workspaceSettings, href: "/settings", icon: Settings, matchPrefix: true },
        ] : []),
      ],
    },
  ].filter(section => section.items.length > 0), [s, isAdmin, isEditor, isEnterpriseMode, isExpired, userRole, effectiveHasDedicatedInfra, unreadSupportCount])

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/" })
  }

  if (!isExpired && pathname?.includes("/content-type-builder")) {
    return null
  }

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col bg-card">
      {/* Workspace Header */}
      <div className="border-b">
        <button
          onClick={() => setWorkspaceSwitcherOpen(!workspaceSwitcherOpen)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 cursor-pointer"
        >
          <div className={cn(
            "w-8 h-8 shrink-0 flex items-center justify-center text-white text-xs font-bold",
            isExpired ? "bg-amber-500" : "bg-gradient-to-br from-emerald-500 to-teal-600"
          )}>
            {isExpired ? <Lock className="h-4 w-4" /> : (currentTenant?.name || "W")[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold truncate">{currentTenant?.name || "Workspace"}</span>
              {isExpired ? (
                <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 shrink-0 font-bold border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                  <Lock className="w-2 h-2" /> Locked
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 capitalize shrink-0 font-bold border-primary/20 text-primary">
                  {currentTenant?.role || "member"}
                </Badge>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground font-mono">/{currentTenant?.slug || tenantId}</span>
          </div>
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform", workspaceSwitcherOpen && "rotate-180")} />
        </button>

        {/* Workspace Switcher */}
        {workspaceSwitcherOpen && (
          <div className="border-t px-2 py-2 space-y-0.5 max-h-64 overflow-y-auto bg-muted/20">
            {liveTenants.map((t) => (
              <button
                key={t.id}
                onClick={() => handleSwitchWorkspace(t.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs transition-colors text-left cursor-pointer",
                  t.id === tenantId
                    ? "bg-primary/10 text-primary font-bold"
                    : "hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                )}
              >
                <div className="w-5 h-5 rounded-lg bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                  {t.name[0].toUpperCase()}
                </div>
                <span className="truncate">{t.name}</span>
                {t.id === tenantId && <ChevronRight className="ml-auto h-3 w-3 text-primary" />}
              </button>
            ))}
            
            <div className="pt-1.5 mt-1.5 border-t">
              <button
                onClick={() => handleSwitchWorkspace()}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs text-primary font-bold hover:bg-primary/10 transition-colors text-left cursor-pointer"
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
                <span>{s.switchWorkspace}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-4">
        <nav className="px-3 space-y-5">
          {navSections.map((section, idx) => (
            <div key={section.label || `section-${idx}`}>
              {section.label && (
                <p className="px-3 mb-1.5 text-[10px] font-black tracking-widest text-muted-foreground/60 uppercase">
                  {section.label}
                </p>
              )}
              <div className="space-y-1">
                {section.items.map((item) => {
                  if (item.children) {
                    const isExpanded = openMenus[item.title];
                    const isAnyChildActive = item.children.some(child => isActive(child));
                    
                    return (
                      <div key={item.title} className="space-y-1">
                        <button
                          onClick={() => toggleMenu(item.title)}
                          className={cn(
                            "w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-xs font-semibold transition-all group",
                            isAnyChildActive && !isExpanded
                              ? "bg-primary/10 text-primary font-bold"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                          )}
                        >
                          <div className="flex items-center gap-2.5">
                            <item.icon className={cn("h-4 w-4 shrink-0 transition-transform group-hover:scale-105", (isAnyChildActive && !isExpanded) ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                            <span className="truncate">{item.title}</span>
                          </div>
                          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", isExpanded && "rotate-180")} />
                        </button>
                        {isExpanded && (
                          <div className="mt-1 space-y-0.5 pl-3 border-l ml-4">
                            {item.children.map(child => {
                              const childActive = isActive(child);
                              return (
                                <Link
                                  key={child.title + child.href}
                                  href={href(child.href)}
                                  onClick={() => setMobileOpen(false)}
                                >
                                  <div
                                    className={cn(
                                      "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs transition-all group",
                                      childActive
                                        ? "bg-primary text-primary-foreground font-bold shadow-xs"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                    )}
                                  >
                                    <child.icon className={cn("h-3.5 w-3.5 shrink-0", childActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
                                    <span className="truncate">{child.title}</span>
                                  </div>
                                </Link>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  }

                  const active = isActive(item)
                  return (
                    <Link
                      key={item.title + (item.href || "")}
                      href={item.href ? href(item.href) : "#"}
                      onClick={() => setMobileOpen(false)}
                      target={item.target}
                    >
                      <div
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all group",
                          active
                            ? "bg-primary text-primary-foreground font-bold shadow-xs"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                        )}
                      >
                        <item.icon className={cn("h-4 w-4 shrink-0 transition-transform group-hover:scale-105", active ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
                        <span className="truncate">{item.title}</span>
                        {item.badge && (
                          <Badge variant="secondary" className="ml-auto text-[9px] h-4 px-1.5 rounded-full font-bold bg-primary/20 text-primary">{item.badge}</Badge>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t p-3 space-y-2">
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-muted/40 border border-border/60">
          <button 
            type="button"
            onClick={() => setIsProfileOpen(true)}
            className="flex items-center gap-2.5 flex-1 min-w-0 hover:opacity-80 transition-opacity text-left cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center text-primary-foreground text-xs font-black shadow-xs shrink-0">
              {session?.user?.image ? (
                <img src={session.user.image} alt={session.user.name || "Avatar"} className="w-full h-full object-cover" />
              ) : (
                session?.user?.name?.[0]?.toUpperCase() ?? "U"
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate text-foreground leading-none mb-1">{session?.user?.name || "User Profile"}</p>
              <p className="text-[10px] text-muted-foreground truncate">{session?.user?.email}</p>
            </div>
          </button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg shrink-0 hover:bg-muted" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {mounted ? (
              theme === "dark" ? <Sun className="h-3.5 w-3.5 text-amber-500" /> : <Moon className="h-3.5 w-3.5 text-primary" />
            ) : (
              <div className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl h-8 text-xs font-semibold transition-all"
          onClick={handleSignOut}
        >
          <LogOut className="h-3.5 w-3.5 text-destructive" />
          <span>{s.signOut}</span>
        </Button>
      </div>
    </div>
  )

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-3 left-3 z-50 md:hidden h-10 w-10 bg-background/80 backdrop-blur border shadow-xs rounded-xl"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={cn("fixed inset-y-0 left-0 z-40 w-64 border-r transition-transform duration-300 md:hidden shadow-none", mobileOpen ? "translate-x-0" : "-translate-x-full")}>
        {renderSidebarContent()}
      </aside>

      <aside className="hidden md:block w-64 border-r shrink-0 h-screen sticky top-0 bg-card">
        {renderSidebarContent()}
      </aside>

      <ProfileModal 
        open={isProfileOpen} 
        onOpenChange={setIsProfileOpen} 
        userRole={currentTenant?.role}
      />
    </>
  )
}

