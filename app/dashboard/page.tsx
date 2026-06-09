"use client"

import { useAuth, fetchWithAuth } from "@/hooks/useAuth"
import { useEffect, useState, useCallback } from "react"

const API_BASE = "https://v5.jkt48connect.com/api/team48"
const API_KEY = "JKTCONNECT"

// ── Types ─────────────────────────────────────────────────────

type AdminStats = {
  total_users: number
  total_resellers: number
  active_members: number
  banned_users: number
  new_7d: number
}

type OrderStats = {
  total: number
  pending: number
  paid: number
  revenue: string
}

type QrisStats = {
  total: number
  pending: number
  paid: number
  expired: number
  cancelled: number
  total_revenue: string
}

type TicketStats = {
  total: number
  pending: number
  paid: number
  expired: number
  cancelled: number
  total_revenue: string
}

type UserRow = {
  user_id: string
  account_id: string
  username: string
  email: string
  full_name: string | null
  role: string
  membership_type: string
  membership_expired_at: string | null
  is_verified: boolean
  is_banned: boolean
  ban_reason: string | null
  created_at: string
}

type BroadcastForm = {
  title: string
  message: string
  type: "info" | "success" | "warning" | "error"
  category: string
  action_url: string
  target_role: string
}

// ── Helpers ───────────────────────────────────────────────────

function formatRp(amount: number | string) {
  return `Rp ${Number(amount).toLocaleString("id-ID")}`
}

function formatDate(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
  })
}

function roleBadge(role: string) {
  const map: Record<string, string> = {
    owner:    "bg-purple-100 text-purple-800",
    admin:    "bg-blue-100 text-blue-800",
    reseller: "bg-yellow-100 text-yellow-800",
    member:   "bg-gray-100 text-gray-700",
  }
  return map[role] ?? "bg-gray-100 text-gray-700"
}

function membershipBadge(type: string) {
  const map: Record<string, string> = {
    vip:     "bg-amber-100 text-amber-800",
    monthly: "bg-green-100 text-green-800",
    weekly:  "bg-teal-100 text-teal-800",
    yearly:  "bg-indigo-100 text-indigo-800",
    free:    "bg-gray-100 text-gray-500",
  }
  return map[type] ?? "bg-gray-100 text-gray-500"
}

// ── Sub-components ────────────────────────────────────────────

function StatCard({ label, value, sub, color = "" }: {
  label: string; value: string | number; sub?: string; color?: string
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-semibold">{title}</h2>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────

export default function DashboardHome() {
  const { user, loading } = useAuth()

  const isAdmin = user?.role === "admin" || user?.role === "owner"

  // ─ State ──────────────────────────────────────────────────
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null)
  const [orderStats, setOrderStats] = useState<OrderStats | null>(null)
  const [qrisStats, setQrisStats] = useState<QrisStats | null>(null)
  const [ticketStats, setTicketStats] = useState<TicketStats | null>(null)
  const [users, setUsers] = useState<UserRow[]>([])
  const [userSearch, setUserSearch] = useState("")
  const [userFilter, setUserFilter] = useState("")
  const [userLoading, setUserLoading] = useState(false)
  const [statsLoading, setStatsLoading] = useState(false)

  // Ban / Unban
  const [banTarget, setBanTarget] = useState<UserRow | null>(null)
  const [banReason, setBanReason] = useState("")
  const [banUntil, setBanUntil] = useState("")
  const [banLoading, setBanLoading] = useState(false)
  const [banMsg, setBanMsg] = useState("")

  // Role
  const [roleTarget, setRoleTarget] = useState<UserRow | null>(null)
  const [newRole, setNewRole] = useState("member")
  const [roleLoading, setRoleLoading] = useState(false)
  const [roleMsg, setRoleMsg] = useState("")

  // Membership manual activate
  const [activateTarget, setActivateTarget] = useState<UserRow | null>(null)
  const [planCode, setPlanCode] = useState("")
  const [activateLoading, setActivateLoading] = useState(false)
  const [activateMsg, setActivateMsg] = useState("")

  // Broadcast
  const [broadcast, setBroadcast] = useState<BroadcastForm>({
    title: "", message: "", type: "info", category: "system", action_url: "", target_role: "",
  })
  const [broadcastLoading, setBroadcastLoading] = useState(false)
  const [broadcastMsg, setBroadcastMsg] = useState("")

  // ─ Fetch Stats ────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    if (!isAdmin) return
    setStatsLoading(true)
    try {
      const [usersRes, ordersRes, qrisRes, ticketRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/admin/users?apikey=${API_KEY}&limit=1`),
        fetchWithAuth(`${API_BASE}/admin/orders?apikey=${API_KEY}&limit=1`),
        fetchWithAuth(`${API_BASE}/qris/admin/orders?apikey=${API_KEY}&limit=1`),
        fetchWithAuth(`${API_BASE}/ticket/admin/orders?apikey=${API_KEY}&limit=1`),
      ])
      const [ud, od, qd, td] = await Promise.all([
        usersRes.json(), ordersRes.json(), qrisRes.json(), ticketRes.json(),
      ])
      if (ud.status) setAdminStats(ud.data.statistics)
      if (od.status) setOrderStats(od.data.statistics)
      if (qd.status) setQrisStats(qd.statistics)
      if (td.status) setTicketStats(td.statistics)
    } catch (_) {}
    setStatsLoading(false)
  }, [isAdmin])

  // ─ Fetch Users ────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    if (!isAdmin) return
    setUserLoading(true)
    try {
      const params = new URLSearchParams({ apikey: API_KEY, limit: "20" })
      if (userSearch) params.set("search", userSearch)
      if (userFilter) params.set("role", userFilter)
      const res = await fetchWithAuth(`${API_BASE}/admin/users?${params}`)
      const data = await res.json()
      if (data.status) setUsers(data.data.users)
    } catch (_) {}
    setUserLoading(false)
  }, [isAdmin, userSearch, userFilter])

  useEffect(() => { if (!loading && isAdmin) { fetchStats(); fetchUsers() } }, [loading, isAdmin, fetchStats, fetchUsers])

  // ─ Ban ────────────────────────────────────────────────────
  async function handleBan() {
    if (!banTarget || !banReason) return
    setBanLoading(true); setBanMsg("")
    try {
      const res = await fetchWithAuth(`${API_BASE}/ban?apikey=${API_KEY}`, {
        method: "PUT",
        body: JSON.stringify({
          user_id: banTarget.user_id,
          ban_reason: banReason,
          banned_until: banUntil || null,
        }),
      })
      const data = await res.json()
      setBanMsg(data.message)
      if (data.status) { setBanTarget(null); setBanReason(""); setBanUntil(""); fetchUsers() }
    } catch (_) { setBanMsg("Error") }
    setBanLoading(false)
  }

  async function handleUnban(u: UserRow) {
    if (!confirm(`Unban @${u.username}?`)) return
    try {
      await fetchWithAuth(`${API_BASE}/unban?apikey=${API_KEY}`, {
        method: "PUT",
        body: JSON.stringify({ user_id: u.user_id }),
      })
      fetchUsers()
    } catch (_) {}
  }

  // ─ Role ───────────────────────────────────────────────────
  async function handleSetRole() {
    if (!roleTarget || !newRole) return
    setRoleLoading(true); setRoleMsg("")
    try {
      const res = await fetchWithAuth(`${API_BASE}/admin/set-role?apikey=${API_KEY}`, {
        method: "PUT",
        body: JSON.stringify({ user_id: roleTarget.user_id, new_role: newRole }),
      })
      const data = await res.json()
      setRoleMsg(data.message)
      if (data.status) { setRoleTarget(null); fetchUsers() }
    } catch (_) { setRoleMsg("Error") }
    setRoleLoading(false)
  }

  // ─ Activate Membership ───────────────────────────────────
  async function handleActivate() {
    if (!activateTarget || !planCode) return
    setActivateLoading(true); setActivateMsg("")
    try {
      const res = await fetchWithAuth(`${API_BASE}/membership/activate?apikey=${API_KEY}`, {
        method: "POST",
        body: JSON.stringify({ user_id: activateTarget.user_id, plan_code: planCode }),
      })
      const data = await res.json()
      setActivateMsg(data.message)
      if (data.status) { setActivateTarget(null); setPlanCode(""); fetchUsers(); fetchStats() }
    } catch (_) { setActivateMsg("Error") }
    setActivateLoading(false)
  }

  // ─ Broadcast ─────────────────────────────────────────────
  async function handleBroadcast(e: React.FormEvent) {
    e.preventDefault()
    if (!broadcast.title || !broadcast.message) return
    setBroadcastLoading(true); setBroadcastMsg("")
    try {
      const body: any = { ...broadcast }
      if (!body.action_url) delete body.action_url
      if (!body.target_role) delete body.target_role
      const res = await fetchWithAuth(`${API_BASE}/admin/broadcast?apikey=${API_KEY}`, {
        method: "POST",
        body: JSON.stringify(body),
      })
      const data = await res.json()
      setBroadcastMsg(data.message)
      if (data.status) setBroadcast({ title: "", message: "", type: "info", category: "system", action_url: "", target_role: "" })
    } catch (_) { setBroadcastMsg("Gagal broadcast") }
    setBroadcastLoading(false)
  }

  // ─ Render: non-admin ──────────────────────────────────────
  if (loading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground text-sm">Memuat dashboard...</p>
      </div>
    )
  }

  const isActive =
    user.membership_type !== "free" &&
    !!user.membership_expired_at &&
    new Date(user.membership_expired_at) > new Date()

  const daysRemaining = isActive
    ? Math.ceil((new Date(user.membership_expired_at!).getTime() - Date.now()) / 86400000)
    : 0

  // ─ Render: member/reseller ────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="flex flex-1 flex-grow flex-col gap-4 lg:gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Halo, {user.full_name || user.username} 👋</h1>
          <p className="text-muted-foreground text-sm mt-1">
            ID Akun: <span className="font-mono font-medium">{user.account_id}</span>
            {user.referral_code && (
              <> · Kode Referral: <span className="font-mono font-medium">{user.referral_code}</span></>
            )}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Membership" value={user.membership_type} sub={isActive ? `${daysRemaining} hari tersisa` : "Tidak aktif"} />
          <StatCard label="Role" value={user.role} sub="Level akun kamu" />
          <StatCard label="Status Email" value={user.is_verified ? "Verified" : "Unverified"} sub={user.is_verified ? "Email terverifikasi" : "Cek inbox kamu"} />
          <StatCard label="Expired" value={isActive ? new Date(user.membership_expired_at!).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—"} sub={isActive ? "Tanggal berakhir" : "Belum berlangganan"} />
        </div>
        <div className="flex flex-1 items-center justify-center rounded-3xl border bg-muted/30 shadow-sm">
          <div className="flex max-w-[480px] flex-col items-center gap-1 text-center p-8">
            {!isActive ? (
              <>
                <h3 className="text-2xl font-bold tracking-tight">Upgrade Membership Kamu</h3>
                <p className="mt-3 text-muted-foreground text-sm">Nikmati akses penuh ke live streaming JKT48, konten eksklusif, dan fitur premium lainnya.</p>
                <a href="/dashboard/membership" className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">Lihat Paket Membership →</a>
              </>
            ) : (
              <>
                <h3 className="text-2xl font-bold tracking-tight">Membership Aktif 🎉</h3>
                <p className="mt-3 text-muted-foreground text-sm">
                  Kamu memiliki akses penuh ke semua konten T48ID. Membership{" "}
                  <span className="font-medium capitalize text-foreground">{user.membership_type}</span>{" "}
                  kamu aktif hingga {new Date(user.membership_expired_at!).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}.
                </p>
                <a href="/live" className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">Tonton Live Sekarang →</a>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─ Render: ADMIN / OWNER ──────────────────────────────────
  return (
    <div className="flex flex-1 flex-col gap-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Admin Dashboard
            <span className="ml-2 inline-flex items-center rounded-md bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 capitalize">{user.role}</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Halo, {user.full_name || user.username} — {user.account_id}</p>
        </div>
        <button onClick={() => { fetchStats(); fetchUsers() }} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Refresh
        </button>
      </div>

      {/* ── Stats Grid ── */}
      {statsLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl border bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div>
            <SectionHeader title="Pengguna" sub="Statistik akun terdaftar" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <StatCard label="Total User" value={adminStats?.total_users ?? "—"} />
              <StatCard label="Member Aktif" value={adminStats?.active_members ?? "—"} color="text-green-600" />
              <StatCard label="Reseller" value={adminStats?.total_resellers ?? "—"} color="text-yellow-600" />
              <StatCard label="Dibanned" value={adminStats?.banned_users ?? "—"} color="text-red-500" />
              <StatCard label="Baru (7 hari)" value={adminStats?.new_7d ?? "—"} color="text-blue-600" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div>
              <SectionHeader title="Order Manual" sub="via payment_method" />
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Total Order" value={orderStats?.total ?? "—"} />
                <StatCard label="Pending" value={orderStats?.pending ?? "—"} color="text-yellow-600" />
                <StatCard label="Paid" value={orderStats?.paid ?? "—"} color="text-green-600" />
                <StatCard label="Revenue" value={orderStats?.revenue ? formatRp(Number(orderStats.revenue)) : "—"} color="text-green-700" />
              </div>
            </div>
            <div>
              <SectionHeader title="QRIS Membership" sub="via YoBasePay" />
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Total Order" value={qrisStats?.total ?? "—"} />
                <StatCard label="Pending" value={qrisStats?.pending ?? "—"} color="text-yellow-600" />
                <StatCard label="Paid" value={qrisStats?.paid ?? "—"} color="text-green-600" />
                <StatCard label="Revenue" value={qrisStats?.total_revenue ? formatRp(Number(qrisStats.total_revenue)) : "—"} color="text-green-700" />
              </div>
            </div>
            <div>
              <SectionHeader title="Ticket Show" sub="via YoBasePay" />
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Total Order" value={ticketStats?.total ?? "—"} />
                <StatCard label="Pending" value={ticketStats?.pending ?? "—"} color="text-yellow-600" />
                <StatCard label="Paid" value={ticketStats?.paid ?? "—"} color="text-green-600" />
                <StatCard label="Revenue" value={ticketStats?.total_revenue ? formatRp(Number(ticketStats.total_revenue)) : "—"} color="text-green-700" />
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── User Management ── */}
      <div>
        <SectionHeader title="Manajemen Pengguna" sub="Cari, ban, ubah role, atau aktifkan membership" />
        <div className="flex gap-2 mb-3 flex-wrap">
          <input
            className="flex-1 min-w-48 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Cari username / email / account_id..."
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && fetchUsers()}
          />
          <select
            className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={userFilter}
            onChange={e => { setUserFilter(e.target.value); setTimeout(fetchUsers, 100) }}
          >
            <option value="">Semua role</option>
            <option value="member">Member</option>
            <option value="reseller">Reseller</option>
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </select>
          <button onClick={fetchUsers} className="rounded-md border bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            Cari
          </button>
        </div>

        {userLoading ? (
          <div className="h-32 rounded-xl border bg-muted/30 animate-pulse" />
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">User</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Role</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Membership</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Bergabung</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Tidak ada data</td></tr>
                ) : users.map(u => (
                  <tr key={u.user_id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{u.username}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                      <p className="text-xs text-muted-foreground font-mono">{u.account_id}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium capitalize ${roleBadge(u.role)}`}>{u.role}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium capitalize ${membershipBadge(u.membership_type)}`}>{u.membership_type}</span>
                      {u.membership_expired_at && (
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDate(u.membership_expired_at)}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {u.is_banned ? (
                        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700">Banned</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700">Aktif</span>
                      )}
                      {!u.is_verified && (
                        <span className="ml-1 inline-flex rounded px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700">Unverified</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDate(u.created_at)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1 flex-wrap">
                        {/* Membership */}
                        <button
                          onClick={() => { setActivateTarget(u); setPlanCode("") }}
                          className="rounded border px-2 py-1 text-xs hover:bg-green-50 hover:border-green-300 hover:text-green-700 transition-colors"
                        >
                          Membership
                        </button>
                        {/* Role — hanya owner */}
                        {user.role === "owner" && (
                          <button
                            onClick={() => { setRoleTarget(u); setNewRole(u.role) }}
                            className="rounded border px-2 py-1 text-xs hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors"
                          >
                            Role
                          </button>
                        )}
                        {/* Ban / Unban */}
                        {u.is_banned ? (
                          <button
                            onClick={() => handleUnban(u)}
                            className="rounded border px-2 py-1 text-xs hover:bg-green-50 hover:border-green-300 hover:text-green-700 transition-colors"
                          >
                            Unban
                          </button>
                        ) : (
                          <button
                            onClick={() => { setBanTarget(u); setBanReason(""); setBanUntil(""); setBanMsg("") }}
                            className="rounded border px-2 py-1 text-xs hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition-colors"
                          >
                            Ban
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Panels: Broadcast + Quick Links ── */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">

        {/* Broadcast */}
        <div className="rounded-xl border p-5">
          <SectionHeader title="Broadcast Notifikasi" sub="Kirim ke semua user atau per role" />
          <form onSubmit={handleBroadcast} className="flex flex-col gap-3">
            <input
              className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Judul notifikasi"
              value={broadcast.title}
              onChange={e => setBroadcast(p => ({ ...p, title: e.target.value }))}
              required
            />
            <textarea
              className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              rows={3}
              placeholder="Isi pesan..."
              value={broadcast.message}
              onChange={e => setBroadcast(p => ({ ...p, message: e.target.value }))}
              required
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={broadcast.type}
                onChange={e => setBroadcast(p => ({ ...p, type: e.target.value as any }))}
              >
                <option value="info">Info</option>
                <option value="success">Success</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>
              <select
                className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={broadcast.target_role}
                onChange={e => setBroadcast(p => ({ ...p, target_role: e.target.value }))}
              >
                <option value="">Semua user</option>
                <option value="member">Member</option>
                <option value="reseller">Reseller</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <input
              className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Action URL (opsional, cth: /membership)"
              value={broadcast.action_url}
              onChange={e => setBroadcast(p => ({ ...p, action_url: e.target.value }))}
            />
            {broadcastMsg && (
              <p className="text-xs text-muted-foreground">{broadcastMsg}</p>
            )}
            <button
              type="submit"
              disabled={broadcastLoading}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {broadcastLoading ? "Mengirim..." : "Kirim Broadcast"}
            </button>
          </form>
        </div>

        {/* Quick Links */}
        <div className="rounded-xl border p-5">
          <SectionHeader title="Panel Cepat" sub="Akses halaman admin lainnya" />
          <div className="grid grid-cols-2 gap-2">
            {[
              { href: "/dashboard/admin/orders", label: "Order Manual", icon: "📋" },
              { href: "/dashboard/admin/qris", label: "QRIS Orders", icon: "🔳" },
              { href: "/dashboard/admin/tickets", label: "Ticket Orders", icon: "🎟️" },
              { href: "/dashboard/admin/products", label: "Produk QRIS", icon: "📦" },
              { href: "/dashboard/admin/ticket-shows", label: "Harga Show", icon: "🎭" },
              { href: "/dashboard/admin/live-tokens", label: "Live Tokens", icon: "🔑" },
              { href: "/dashboard/admin/resellers", label: "Reseller Apps", icon: "🤝" },
              { href: "/dashboard/admin/membership-plans", label: "Paket Member", icon: "⭐" },
            ].map(item => (
              <a
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors"
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* ── Modal: Ban ── */}
      {banTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-2xl border bg-background p-6 shadow-xl mx-4">
            <h3 className="font-semibold mb-1">Ban @{banTarget.username}</h3>
            <p className="text-sm text-muted-foreground mb-4">Account ID: {banTarget.account_id}</p>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Alasan ban *</label>
                <input
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Misal: Spam, pelanggaran TOS..."
                  value={banReason}
                  onChange={e => setBanReason(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Ban hingga (opsional — kosongkan untuk permanen)</label>
                <input
                  type="datetime-local"
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={banUntil}
                  onChange={e => setBanUntil(e.target.value)}
                />
              </div>
              {banMsg && <p className="text-xs text-red-500">{banMsg}</p>}
              <div className="flex gap-2 mt-1">
                <button
                  onClick={handleBan}
                  disabled={banLoading || !banReason}
                  className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {banLoading ? "Memproses..." : "Ban User"}
                </button>
                <button
                  onClick={() => { setBanTarget(null); setBanMsg("") }}
                  className="flex-1 rounded-md border px-4 py-2 text-sm hover:bg-muted/50 transition-colors"
                >
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Set Role ── */}
      {roleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-2xl border bg-background p-6 shadow-xl mx-4">
            <h3 className="font-semibold mb-1">Ubah Role</h3>
            <p className="text-sm text-muted-foreground mb-4">@{roleTarget.username} · saat ini: <span className="capitalize font-medium">{roleTarget.role}</span></p>
            <div className="flex flex-col gap-3">
              <select
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
              >
                <option value="member">Member</option>
                <option value="reseller">Reseller</option>
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
              </select>
              {roleMsg && <p className="text-xs text-muted-foreground">{roleMsg}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleSetRole}
                  disabled={roleLoading}
                  className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {roleLoading ? "Memproses..." : "Simpan"}
                </button>
                <button
                  onClick={() => { setRoleTarget(null); setRoleMsg("") }}
                  className="flex-1 rounded-md border px-4 py-2 text-sm hover:bg-muted/50 transition-colors"
                >
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Activate Membership ── */}
      {activateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-2xl border bg-background p-6 shadow-xl mx-4">
            <h3 className="font-semibold mb-1">Aktifkan Membership</h3>
            <p className="text-sm text-muted-foreground mb-4">@{activateTarget.username} · membership saat ini: <span className="capitalize font-medium">{activateTarget.membership_type}</span></p>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Plan Code *</label>
                <input
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Misal: monthly, weekly, yearly, vip"
                  value={planCode}
                  onChange={e => setPlanCode(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">Lihat plan code di halaman Paket Member</p>
              </div>
              {activateMsg && <p className="text-xs text-muted-foreground">{activateMsg}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleActivate}
                  disabled={activateLoading || !planCode}
                  className="flex-1 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {activateLoading ? "Memproses..." : "Aktifkan"}
                </button>
                <button
                  onClick={() => { setActivateTarget(null); setActivateMsg("") }}
                  className="flex-1 rounded-md border px-4 py-2 text-sm hover:bg-muted/50 transition-colors"
                >
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
