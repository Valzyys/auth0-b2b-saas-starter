"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState, useEffect, useCallback } from "react"
import {
  LayoutDashboard,
  CalendarDays,
  CreditCard,
  Radio,
  PlaySquare,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Loader2,
} from "lucide-react"
import { ModeToggle } from "@/components/mode-toggle"
import { useAuth } from "@/hooks/useAuth"

// ─── Constants ───────────────────────────────────────────────
const API_BASE = "https://v5.jkt48connect.com/api/team48"
const API_KEY  = "JKTCONNECT"

// ─── Helpers ─────────────────────────────────────────────────
function isMembershipActive(type?: string, expiredAt?: string | null): boolean {
  if (!type || type === "free") return false
  if (!expiredAt) return false
  return new Date(expiredAt) > new Date()
}

async function fetchWithAuth(url: string) {
  let token: string | null = null
  try {
    const ls = localStorage.getItem("t48_auth")
    if (ls) { const p = JSON.parse(ls); if (p?.access_token) token = p.access_token }
    if (!token) {
      const m = document.cookie.match(/(?:^|;\s*)t48_access_token=([^;]*)/)
      if (m) token = decodeURIComponent(m[1])
    }
  } catch {}

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers["Authorization"] = `Bearer ${token}`
  const res = await fetch(url, { headers })
  return res.json()
}

// ─── Shared resolver (dipakai oleh live & replay) ────────────
interface ResolvedUrl {
  url: string | null
  resolving: boolean
}

function useResolvedNavUrl(
  userId: string | undefined,
  paths: { memb: string; ticket: (tokenId: string) => string; fallback: string }
): ResolvedUrl & { refresh: () => void } {
  const [url,       setUrl]       = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)

  const resolve = useCallback(async () => {
    if (!userId) { setUrl(paths.fallback); return }
    setResolving(true)
    try {
      // 1. Cek membership
      const profile = await fetchWithAuth(
        `${API_BASE}/profile/me?apikey=${API_KEY}`
      )
      if (
        profile?.status &&
        isMembershipActive(
          profile.data?.membership_type,
          profile.data?.membership_expired_at
        )
      ) {
        setUrl(paths.memb)
        return
      }

      // 2. Cek tickets aktif
      const tickets = await fetchWithAuth(
        `${API_BASE}/ticket/my-tickets?apikey=${API_KEY}`
      )
      if (tickets?.status && tickets.data?.tickets?.length > 0) {
        const valid = (tickets.data.tickets as {
          is_valid: boolean
          is_token_expired: boolean
          live_token_id: string
          scheduled_at: string | null
        }[]).filter(t => t.is_valid && !t.is_token_expired)

        if (valid.length > 0) {
          const sorted = valid.sort((a, b) => {
            const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0
            const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0
            return tb - ta
          })
          setUrl(paths.ticket(sorted[0].live_token_id))
          return
        }
      }

      // 3. Fallback
      setUrl(paths.fallback)
    } catch {
      setUrl(paths.fallback)
    } finally {
      setResolving(false)
    }
  }, [userId, paths.memb, paths.fallback])

  useEffect(() => { resolve() }, [resolve])

  return { url, resolving, refresh: resolve }
}

// ─── Nav items ────────────────────────────────────────────────
const STATIC_NAV = [
  { href: "/dashboard",            label: "Home",       icon: LayoutDashboard },
  { href: "/dashboard/show",       label: "Jadwal",     icon: CalendarDays },
  { href: "/dashboard/membership", label: "Membership", icon: CreditCard },
]

// ─── Layout ───────────────────────────────────────────────────
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, loading, logout } = useAuth()
  const pathname = usePathname()
  const router   = useRouter()

  const [mobileOpen,  setMobileOpen]  = useState(false)
  const [desktopOpen, setDesktopOpen] = useState(true)
  const [liveLoading,   setLiveLoading]   = useState(false)
  const [replayLoading, setReplayLoading] = useState(false)

  // ── Live URL resolver ──────────────────────────────────────
  const {
    url: liveUrl,
    resolving: liveResolving,
  } = useResolvedNavUrl(user?.user_id, {
    memb:     "/live/memb",
    ticket:   (id) => `/live/${id}`,
    fallback: "/live/show",
  })

  // ── Replay URL resolver ────────────────────────────────────
  const {
    url: replayUrl,
    resolving: replayResolving,
  } = useResolvedNavUrl(user?.user_id, {
    memb:     "/replay/memb",
    ticket:   (id) => `/replay/${id}`,
    fallback: "/replay/show",
  })

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground animate-pulse">Memuat...</p>
      </div>
    )
  }

  // ── Live nav click handler ─────────────────────────────────
  const handleLiveClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (liveResolving) return

    if (liveUrl) {
      setMobileOpen(false)
      router.push(liveUrl)
      return
    }

    setLiveLoading(true)
    try {
      await new Promise(r => setTimeout(r, 800))
      router.push("/live/show")
    } finally {
      setLiveLoading(false)
      setMobileOpen(false)
    }
  }

  // ── Replay nav click handler ───────────────────────────────
  const handleReplayClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (replayResolving) return

    if (replayUrl) {
      setMobileOpen(false)
      router.push(replayUrl)
      return
    }

    setReplayLoading(true)
    try {
      await new Promise(r => setTimeout(r, 800))
      router.push("/replay/show")
    } finally {
      setReplayLoading(false)
      setMobileOpen(false)
    }
  }

  // ── Nav link helper (static) ────────────────────────────────
  const NavLink = ({
    href, label, icon: Icon, collapsed,
  }: {
    href:      string
    label:     string
    icon:      React.ElementType
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

  // ── Shared dynamic nav button ───────────────────────────────
  const DynamicNavButton = ({
    collapsed,
    icon: Icon,
    label,
    resolving,
    loading: btnLoading,
    resolvedUrl,
    basePath,
    badge,
    onClick,
  }: {
    collapsed?:   boolean
    icon:         React.ElementType
    label:        string
    resolving:    boolean
    loading:      boolean
    resolvedUrl:  string | null
    basePath:     string   // e.g. "/live" | "/replay"
    badge:        { label: string; cls: string } | null
    onClick:      (e: React.MouseEvent) => void
  }) => {
    const isActive = pathname.startsWith(basePath)
    const busy     = resolving || btnLoading

    return (
      <button
        onClick={onClick}
        title={collapsed ? label : undefined}
        disabled={busy}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors disabled:opacity-60 ${
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        } ${collapsed ? "justify-center px-2" : ""}`}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        ) : (
          <Icon className="h-4 w-4 shrink-0" />
        )}

        {!collapsed && (
          <>
            <span className="flex-1 text-left">{label}</span>

            {badge && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
                {badge.label}
              </span>
            )}

            {isActive && !badge && (
              <ChevronRight className="h-3.5 w-3.5 opacity-60" />
            )}
          </>
        )}
      </button>
    )
  }

  // ── Badge resolver helper ───────────────────────────────────
  function resolveBadge(
    resolving: boolean,
    loading:   boolean,
    url:       string | null,
    fallback:  string,
    membPath:  string,
  ) {
    if (resolving || loading || !url) return null
    if (url === membPath)  return { label: "MBR", cls: "bg-blue-500/20 text-blue-300" }
    if (url !== fallback)  return { label: "TKT", cls: "bg-green-500/20 text-green-300" }
    return null
  }

  // ── Sidebar content ─────────────────────────────────────────
  const SidebarContent = ({ collapsed = false }: { collapsed?: boolean }) => (
    <div className="flex h-full flex-col">
      {/* Logo + toggle */}
      <div className={`flex h-14 items-center border-b border-border ${
        collapsed ? "justify-center px-2" : "justify-between px-4"
      }`}>
        {!collapsed && (
          <Link href="/dashboard" className="font-mono font-bold text-base tracking-tight">
            T48ID
          </Link>
        )}
        <button
          onClick={() => setDesktopOpen(v => !v)}
          className="hidden lg:flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title={collapsed ? "Buka sidebar" : "Tutup sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
        {!collapsed && (
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-0.5">
        {STATIC_NAV.map(item => (
          <NavLink key={item.href} {...item} collapsed={collapsed} />
        ))}

        {/* Live */}
        <DynamicNavButton
          collapsed={collapsed}
          icon={Radio}
          label="Live"
          resolving={liveResolving}
          loading={liveLoading}
          resolvedUrl={liveUrl}
          basePath="/live"
          badge={resolveBadge(liveResolving, liveLoading, liveUrl, "/live/show", "/live/memb")}
          onClick={handleLiveClick}
        />

        {/* Replay */}
        <DynamicNavButton
          collapsed={collapsed}
          icon={PlaySquare}
          label="Replay"
          resolving={replayResolving}
          loading={replayLoading}
          resolvedUrl={replayUrl}
          basePath="/replay"
          badge={resolveBadge(replayResolving, replayLoading, replayUrl, "/replay/show", "/replay/memb")}
          onClick={handleReplayClick}
        />
      </nav>

      {/* Bottom */}
      <div className={`border-t border-border p-2 space-y-1 ${collapsed ? "items-center" : ""}`}>
        <NavLink
          href="/dashboard/account/profile"
          label="Pengaturan"
          icon={Settings}
          collapsed={collapsed}
        />

        {!collapsed ? (
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
            {user.avatar ? (
              <img src={user.avatar} alt={user.username}
                className="h-8 w-8 rounded-full object-cover shrink-0" />
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
          <div className="flex justify-center py-1">
            {user.avatar ? (
              <img src={user.avatar} alt={user.username} title={user.full_name || user.username}
                className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <div title={user.full_name || user.username}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold uppercase">
                {(user.full_name || user.username)?.[0] ?? "U"}
              </div>
            )}
          </div>
        )}

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

      {/* Desktop Sidebar */}
      <aside className={`hidden lg:flex flex-col border-r border-border bg-background fixed inset-y-0 left-0 z-30 transition-all duration-200 ease-in-out ${
        desktopOpen ? "w-60" : "w-14"
      }`}>
        <SidebarContent collapsed={!desktopOpen} />
      </aside>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-background border-r border-border transform transition-transform duration-200 ease-in-out lg:hidden ${
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        <SidebarContent collapsed={false} />
      </aside>

      {/* Main Content */}
      <div className={`flex flex-1 flex-col transition-all duration-200 ease-in-out ${
        desktopOpen ? "lg:pl-60" : "lg:pl-14"
      }`}>
        {/* Mobile Topbar */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background px-4 lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link href="/dashboard" className="font-mono font-bold text-base">T48ID</Link>

          <div className="flex items-center gap-2">
            <ModeToggle />
            {user.avatar ? (
              <img src={user.avatar} alt={user.username}
                className="h-8 w-8 rounded-full object-cover" />
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
            <span>&copy; {new Date().getFullYear()} T48ID | GISTREAM. All rights reserved.</span>
          </div>
        </footer>
      </div>
    </div>
  )
}
