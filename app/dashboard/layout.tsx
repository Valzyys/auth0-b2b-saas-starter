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
} from "lucide-react"
import { ModeToggle } from "@/components/mode-toggle"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/useAuth"

const NAV_ITEMS = [
  { href: "/dashboard",    label: "Home",       icon: LayoutDashboard },
  { href: "/show",         label: "Jadwal",     icon: CalendarDays },
  { href: "/membership",   label: "Membership", icon: CreditCard },
  { href: "/live",         label: "Live",       icon: Radio },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, loading, logout } = useAuth()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground animate-pulse">Memuat...</p>
      </div>
    )
  }

  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-border px-4">
        <Link
          href="/dashboard"
          className="font-mono font-bold text-base tracking-tight"
          onClick={() => setSidebarOpen(false)}
        >
          T48ID
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
              {active && <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-60" />}
            </Link>
          )
        })}
      </nav>

      {/* Bottom: User + Actions */}
      <div className="border-t border-border p-3 space-y-2">
        {/* Settings */}
        <Link
          href="/dashboard/account/profile"
          onClick={() => setSidebarOpen(false)}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            pathname.startsWith("/dashboard/account")
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          <Settings className="h-4 w-4 shrink-0" />
          Pengaturan
        </Link>

        {/* User card */}
        <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
          {user.avatar ? (
            <img
              src={user.avatar}
              alt={user.username}
              className="h-8 w-8 rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold uppercase">
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

        {/* Logout */}
        <button
          onClick={() => { setSidebarOpen(false); logout() }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Logout
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-background">

      {/* ── Desktop Sidebar ── */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-border bg-background fixed inset-y-0 left-0 z-30">
        <SidebarContent />
      </aside>

      {/* ── Mobile Overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Mobile Sidebar (slide-in) ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-background border-r border-border transform transition-transform duration-200 ease-in-out lg:hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarContent />
      </aside>

      {/* ── Main Content ── */}
      <div className="flex flex-1 flex-col lg:pl-60">

        {/* Mobile Topbar */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
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
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold uppercase">
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
            <span>&copy; {new Date().getFullYear()} T48ID. All rights reserved.</span>
          </div>
        </footer>
      </div>
    </div>
  )
}
