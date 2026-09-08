"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  TrendingUp,
  Receipt,
  PieChart,
  Layers,
  ShieldCheck,
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
} from "lucide-react"
import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { useSession, signOut } from "next-auth/react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { NestedSidebarHeader } from "@/components/dashboard/nested-sidebar-header"
import { ProfileModal } from "@/components/dashboard/profile-modal"

const billingNavItems = [
  { 
    title: "Ringkasan Eksekutif", 
    href: "/admin/billing", 
    icon: LayoutDashboard, 
    exact: true,
  },
  { 
    title: "Laporan Laba & Rugi", 
    href: "/admin/billing/laba-rugi", 
    icon: TrendingUp, 
  },
  { 
    title: "Margin Keuntungan Paket", 
    href: "/admin/billing/margin-keuntungan", 
    icon: PieChart, 
  },
  { 
    title: "Unit Economics Tenant", 
    href: "/admin/billing/tenant-economics", 
    icon: Layers, 
  },
  { 
    title: "Riwayat Transaksi", 
    href: "/admin/billing/transactions", 
    icon: Receipt, 
  },
]

export function BillingSubSidebar() {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const { data: session } = useSession()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/" })
  }

  const isActive = (itemHref: string, exact?: boolean) => {
    if (exact) {
      return pathname === itemHref
    }
    return pathname === itemHref || pathname.startsWith(`${itemHref}/`)
  }

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col bg-card border-r border-border shadow-none">
      {/* Header seragam dengan NestedSidebarHeader */}
      <NestedSidebarHeader
        backHref="/admin"
        backTooltip="Kembali ke Admin Hub"
        logoHref="/admin/billing"
        portalBadge="Keuangan"
      />

      {/* Nav items */}
      <ScrollArea className="flex-1 py-4">
        <div className="px-3 space-y-6">
          <div className="space-y-1">
            <p className="px-3 mb-2 text-[10px] font-black tracking-widest text-muted-foreground/60 uppercase">
              Laporan Keuangan
            </p>
            {billingNavItems.map((item) => {
              const active = isActive(item.href, item.exact)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                >
                  <div
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 text-xs font-semibold transition-all rounded-xl group",
                      active
                        ? "bg-primary text-primary-foreground font-bold shadow-xs"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    )}
                  >
                    <item.icon
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform group-hover:scale-105",
                        active ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
                      )}
                    />
                    <span className="truncate flex-1">{item.title}</span>
                  </div>
                </Link>
              )
            })}
          </div>

          {/* Info Card Margin */}
          <div className="pt-2">
            <div className="p-3 rounded-xl bg-muted/40 border border-border/60 space-y-1.5">
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Margin Terlindungi</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Target margin laba VPS & VDS 500% aktif pada semua transaksi appliance.
              </p>
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Footer terstandarisasi dengan user avatar, theme toggle, dan sign out */}
      <div className="border-t border-border p-3 space-y-2 shrink-0">
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
                session?.user?.name?.[0]?.toUpperCase() ?? "A"
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-foreground truncate">{session?.user?.name || "Admin Profile"}</p>
              <p className="text-[10px] text-muted-foreground capitalize truncate">
                {session?.user?.role ? session.user.role.replace("_", " ") : "Super Admin"}
              </p>
            </div>
          </button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" 
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title={theme === "dark" ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
          >
            {mounted ? (
              theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />
            ) : (
              <div className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground hover:bg-muted h-8 text-xs font-medium rounded-lg"
          onClick={handleSignOut}
        >
          <LogOut className="h-3.5 w-3.5" />
          Keluar
        </Button>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile Toggle Button */}
      <Button
        variant="outline"
        size="icon"
        className="fixed top-3 left-3 z-50 md:hidden h-10 w-10 bg-card/90 backdrop-blur border border-border shadow-xs rounded-xl text-foreground"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-zinc-900/50 backdrop-blur-xs md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 transition-transform duration-200 md:hidden bg-card",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {renderSidebarContent()}
      </aside>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col h-full bg-card border-r border-border">
        {renderSidebarContent()}
      </aside>

      <ProfileModal open={isProfileOpen} onOpenChange={setIsProfileOpen} />
    </>
  )
}
