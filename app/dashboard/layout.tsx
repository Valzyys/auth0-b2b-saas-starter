"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import {
  LayoutDashboard,
  CalendarDays,
  CreditCard,
  Radio,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react"
import { ModeToggle } from "@/components/mode-toggle"
import { useAuth } from "@/hooks/useAuth"

const NAV_ITEMS = [
  { href: "/dashboard",  label: "Home",       icon: LayoutDashboard },
  { href: "/dashboard/show",       label: "Jadwal",     icon: CalendarDays },
  { href: "/dashboard/membership", label: "Membership", icon: CreditCard },
  { href: "/live",       label: "Live",       icon: Radio },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, loading, logout } = useAuth()
  const pathname = usePathname()
  const [mobileOpen,  setMobileOpen]  = useState(false)
  const [desktopOpen, setDesktopOpen] = useState(true)

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground animate-pulse">Memuat...</p>
      </div>
    )
  }

  // ── Nav link helper ──────────────────────────────────────
  const NavLink = ({ href, label, icon: Icon, collapsed }: {
    href: string
    label: string
    icon: React.ElementType
    collapsed?: boolean
  }) => {
    const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href))
    return (
      <Link
        href={href}
        onClick={() => setMobileOpen(false)}
        title={collapsed ? label : undefined}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          active
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        } ${collapsed ? "justify-center px-2" : ""}`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span className="flex-1">{label}</span>}
        {!collapsed && active && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
      </Link>
    )
  }

  // ── Sidebar content (shared mobile & desktop) ────────────
  const SidebarContent = ({ collapsed = false }: { collapsed?: boolean }) => (
    <div className="flex h-full flex-col">
      {/* Logo + toggle (desktop) */}
      <div className={`flex h-14 items-center border-b border-border ${collapsed ? "justify-center px-2" : "justify-between px-4"}`}>
        {!collapsed && (
          <Link href="/dashboard" className="font-mono font-bold text-base tracking-tight">
            T48ID
          </Link>
        )}
        {/* Desktop close/open button */}
        <button
          onClick={() => setDesktopOpen((v) => !v)}
          className="hidden lg:flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title={collapsed ? "Buka sidebar" : "Tutup sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
        {/* Mobile close button */}
        {!collapsed && (
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-0.5">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} {...item} collapsed={collapsed} />
        ))}
      </nav>

      {/* Bottom section */}
      <div className={`border-t border-border p-2 space-y-1 ${collapsed ? "items-center" : ""}`}>
        {/* Settings */}
        <NavLink
          href="/dashboard/account/profile"
          label="Pengaturan"
          icon={Settings}
          collapsed={collapsed}
        />

        {/* User card */}
        {!collapsed ? (
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.username}
                className="h-8 w-8 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold uppercase">
                {(user.full_name || user.username)?.[0] ?? "U"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-none truncate">
                {user.full_name || user.username}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 capitalize truncate">
                {user.membership_type} · {user.role}
              </p>
            </div>
            <ModeToggle />
          </div>
        ) : (
          /* Collapsed — hanya avatar */
          <div className="flex justify-center py-1">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.username}
                title={user.full_name || user.username}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div
                title={user.full_name || user.username}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold uppercase"
              >
                {(user.full_name || user.username)?.[0] ?? "U"}
              </div>
            )}
          </div>
        )}

        {/* Logout */}
        <button
          onClick={() => { setMobileOpen(false); logout() }}
          title={collapsed ? "Logout" : undefined}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors ${
            collapsed ? "justify-center px-2" : ""
          }`}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>

        {/* ModeToggle saat collapsed */}
        {collapsed && (
          <div className="flex justify-center">
            <ModeToggle />
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-background">

      {/* ── Desktop Sidebar ──────────────────────────────── */}
      <aside
        className={`hidden lg:flex flex-col border-r border-border bg-background fixed inset-y-0 left-0 z-30 transition-all duration-200 ease-in-out ${
          desktopOpen ? "w-60" : "w-14"
        }`}
      >
        <SidebarContent collapsed={!desktopOpen} />
      </aside>

      {/* ── Mobile Overlay ───────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile Sidebar (slide-in) ────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-background border-r border-border transform transition-transform duration-200 ease-in-out lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarContent collapsed={false} />
      </aside>

      {/* ── Main Content ─────────────────────────────────── */}
      <div
        className={`flex flex-1 flex-col transition-all duration-200 ease-in-out ${
          desktopOpen ? "lg:pl-60" : "lg:pl-14"
        }`}
      >
        {/* Mobile Topbar */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background px-4 lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link href="/dashboard" className="font-mono font-bold text-base">
            T48ID
          </Link>

          <div className="flex items-center gap-2">
            <ModeToggle />
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.username}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold uppercase">
                {(user.full_name || user.username)?.[0] ?? "U"}
              </div>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-border px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <Link href="/" className="font-mono font-semibold hover:text-foreground transition-colors">
              T48ID Official
            </Link>
            <span>&copy; {new Date().getFullYear()} T48ID | GISTREAM . All rights reserved.</span>
          </div>
        </footer>
      </div>
    </div>
  )
}
