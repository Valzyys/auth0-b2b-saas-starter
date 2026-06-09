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

type OrderRow = {
  order_id: string
  username: string
  email: string
  account_id: string
  plan_name: string
  plan_code: string
  final_amount: string
  status: string
  payment_method: string
  created_at: string
  paid_at: string | null
}

type QrisOrderRow = {
  id: string
  ref_id: string
  username: string
  user_email: string
  product_name: string
  product_code: string
  amount: string
  status: string
  created_at: string
  paid_at: string | null
  expired_at: string
}

type TicketOrderRow = {
  id: string
  ref_id: string
  username: string
  user_email: string
  show_title: string
  show_id: string
  amount: string
  status: string
  live_token_id: string | null
  created_at: string
  paid_at: string | null
}

type QrisProduct = {
  id: number
  product_code: string
  product_name: string
  membership_type: string
  duration_days: number
  price: string
  price_sale: string | null
  description: string | null
  stock_per_month: number
  current_stock: number
  sold_count: number
  stock_remaining: number
  is_active: boolean
  is_purchase_open: boolean
  is_popular: boolean
  sort_order: number
}

type TicketShow = {
  show_id: string
  slug: string
  title: string
  image_url: string | null
  status: string
  scheduled_at: string | null
  idn_room_identifier: string | null
  ticket: {
    is_configured: boolean
    is_available: boolean
    is_sold_out: boolean
    price: number
    price_sale: number | null
    effective_price: number
    stock_remaining: number
    token_max_uses: number
   // token_ttl_hours: number
    sold_count?: number
    max_stock?: number
    token_ttl_hours?: number
  }
}

type LiveToken = {
  id: number
  live_id: string
  show_id: string | null
  label: string
  max_uses: number
  uses_count: number
  expires_at: string
  is_active: boolean
  created_by: string
  notes: string | null
  created_at: string
}

type MembershipPlan = {
  id: number
  plan_code: string
  plan_name: string
  membership_type: string
  duration_days: number
  price: string
  price_sale: string | null
  is_active: boolean
  is_popular: boolean
  sort_order: number
}

type ResellerApp = {
  id: number
  user_id: string
  username: string
  email: string
  full_name: string | null
  account_id: string
  reason: string | null
  bank_name: string | null
  bank_account: string | null
  bank_holder: string | null
  status: string
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

type TicketConfig = {
  defaultPrice: number
  defaultStock: number
  defaultTokenMaxUses: number
  defaultTokenTtlHours: number
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

function formatDateTime(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
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

function statusBadge(status: string) {
  const map: Record<string, string> = {
    paid:      "bg-green-100 text-green-700",
    pending:   "bg-yellow-100 text-yellow-700",
    expired:   "bg-gray-100 text-gray-500",
    cancelled: "bg-red-100 text-red-600",
    refunded:  "bg-blue-100 text-blue-600",
    failed:    "bg-red-100 text-red-600",
    approved:  "bg-green-100 text-green-700",
    rejected:  "bg-red-100 text-red-600",
  }
  return map[status] ?? "bg-gray-100 text-gray-600"
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

function TabBar({ tabs, active, onChange }: {
  tabs: { key: string; label: string }[]
  active: string
  onChange: (k: string) => void
}) {
  return (
    <div className="flex gap-1 flex-wrap border-b mb-4">
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            active === t.key
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────

export default function DashboardHome() {
  const { user, loading } = useAuth()
  const isAdmin = user?.role === "admin" || user?.role === "owner"

  // ─ Active Section Tab ─────────────────────────────────────
  const [activeSection, setActiveSection] = useState("overview")

  // ─ Stats ──────────────────────────────────────────────────
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null)
  const [orderStats, setOrderStats] = useState<OrderStats | null>(null)
  const [qrisStats, setQrisStats] = useState<QrisStats | null>(null)
  const [ticketStats, setTicketStats] = useState<TicketStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  // ─ Users ──────────────────────────────────────────────────
  const [users, setUsers] = useState<UserRow[]>([])
  const [userSearch, setUserSearch] = useState("")
  const [userFilter, setUserFilter] = useState("")
  const [userLoading, setUserLoading] = useState(false)

  // ─ Orders Manual ──────────────────────────────────────────
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [orderFilter, setOrderFilter] = useState("")
  const [ordersLoading, setOrdersLoading] = useState(false)

  // ─ QRIS Orders ────────────────────────────────────────────
  const [qrisOrders, setQrisOrders] = useState<QrisOrderRow[]>([])
  const [qrisOrderFilter, setQrisOrderFilter] = useState("")
  const [qrisOrdersLoading, setQrisOrdersLoading] = useState(false)

  // ─ Ticket Orders ──────────────────────────────────────────
  const [ticketOrders, setTicketOrders] = useState<TicketOrderRow[]>([])
  const [ticketOrderFilter, setTicketOrderFilter] = useState("")
  const [ticketOrdersLoading, setTicketOrdersLoading] = useState(false)

  // ─ QRIS Products ──────────────────────────────────────────
  const [qrisProducts, setQrisProducts] = useState<QrisProduct[]>([])
  const [qrisProductsLoading, setQrisProductsLoading] = useState(false)
  const [newProduct, setNewProduct] = useState({
    product_code: "", product_name: "", membership_type: "monthly",
    duration_days: 30, price: "", price_sale: "", description: "",
    stock_per_month: 100, is_active: true, is_purchase_open: true,
    is_popular: false, sort_order: 0,
  })
  const [productMsg, setProductMsg] = useState("")
  const [productLoading, setProductLoading] = useState(false)
  const [editProduct, setEditProduct] = useState<QrisProduct | null>(null)
  const [editProductMsg, setEditProductMsg] = useState("")
  const [editProductLoading, setEditProductLoading] = useState(false)

  // ─ Ticket Shows ───────────────────────────────────────────
  const [ticketShows, setTicketShows] = useState<TicketShow[]>([])
  const [ticketConfig, setTicketConfig] = useState<TicketConfig | null>(null)
  const [ticketShowsLoading, setTicketShowsLoading] = useState(false)
  const [priceTarget, setPriceTarget] = useState<TicketShow | null>(null)
  const [priceForm, setPriceForm] = useState({
    price: "", price_sale: "", max_stock: "", is_active: true, is_sale_open: true,
    token_max_uses: 1, token_ttl_hours: 72,
  })
  const [priceMsg, setPriceMsg] = useState("")
  const [priceLoading, setPriceLoading] = useState(false)
  const [ticketConfigForm, setTicketConfigForm] = useState({
    default_price: "", default_stock: "", default_token_max_uses: "", default_token_ttl_hours: "",
  })
  const [ticketConfigMsg, setTicketConfigMsg] = useState("")
  const [ticketConfigLoading, setTicketConfigLoading] = useState(false)

  // ─ Live Tokens ────────────────────────────────────────────
  const [liveTokens, setLiveTokens] = useState<LiveToken[]>([])
  const [liveTokensLoading, setLiveTokensLoading] = useState(false)
  const [newToken, setNewToken] = useState({
    label: "", max_uses: 1, expires_hours: 24, show_id: "", notes: "",
  })
  const [tokenMsg, setTokenMsg] = useState("")
  const [tokenLoading, setTokenLoading] = useState(false)

  // ─ Membership Plans ───────────────────────────────────────
  const [membershipPlans, setMembershipPlans] = useState<MembershipPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(false)

  // ─ Reseller Apps ──────────────────────────────────────────
  const [resellerApps, setResellerApps] = useState<ResellerApp[]>([])
  const [resellerLoading, setResellerLoading] = useState(false)
  const [resellerFilter, setResellerFilter] = useState("pending")
  const [approveTarget, setApproveTarget] = useState<ResellerApp | null>(null)
  const [approveCommission, setApproveCommission] = useState("10")
  const [approveNotes, setApproveNotes] = useState("")
  const [approveLoading, setApproveLoading] = useState(false)
  const [approveMsg, setApproveMsg] = useState("")

  // ─ Ban / Unban ────────────────────────────────────────────
  const [banTarget, setBanTarget] = useState<UserRow | null>(null)
  const [banReason, setBanReason] = useState("")
  const [banUntil, setBanUntil] = useState("")
  const [banLoading, setBanLoading] = useState(false)
  const [banMsg, setBanMsg] = useState("")

  // ─ Role ───────────────────────────────────────────────────
  const [roleTarget, setRoleTarget] = useState<UserRow | null>(null)
  const [newRole, setNewRole] = useState("member")
  const [roleLoading, setRoleLoading] = useState(false)
  const [roleMsg, setRoleMsg] = useState("")

  // ─ Activate Membership ───────────────────────────────────
  const [activateTarget, setActivateTarget] = useState<UserRow | null>(null)
  const [planCode, setPlanCode] = useState("")
  const [activateLoading, setActivateLoading] = useState(false)
  const [activateMsg, setActivateMsg] = useState("")

  // ─ Broadcast ─────────────────────────────────────────────
  const [broadcast, setBroadcast] = useState<BroadcastForm>({
    title: "", message: "", type: "info", category: "system", action_url: "", target_role: "",
  })
  const [broadcastLoading, setBroadcastLoading] = useState(false)
  const [broadcastMsg, setBroadcastMsg] = useState("")

  // ─ Order status update ────────────────────────────────────
  const [updateOrderTarget, setUpdateOrderTarget] = useState<OrderRow | null>(null)
  const [updateOrderStatus, setUpdateOrderStatus] = useState("")
  const [updateOrderNotes, setUpdateOrderNotes] = useState("")
  const [updateOrderLoading, setUpdateOrderLoading] = useState(false)
  const [updateOrderMsg, setUpdateOrderMsg] = useState("")

  // ─ Stock update ───────────────────────────────────────────
  const [stockTarget, setStockTarget] = useState<QrisProduct | null>(null)
  const [stockValue, setStockValue] = useState("")
  const [stockMsg, setStockMsg] = useState("")
  const [stockLoading, setStockLoading] = useState(false)

  // ═══════════════════════════════════════════════════════════
  // FETCH FUNCTIONS
  // ═══════════════════════════════════════════════════════════

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

  const fetchOrders = useCallback(async () => {
    if (!isAdmin) return
    setOrdersLoading(true)
    try {
      const params = new URLSearchParams({ apikey: API_KEY, limit: "50" })
      if (orderFilter) params.set("status", orderFilter)
      const res = await fetchWithAuth(`${API_BASE}/admin/orders?${params}`)
      const data = await res.json()
      if (data.status) setOrders(data.data.orders)
    } catch (_) {}
    setOrdersLoading(false)
  }, [isAdmin, orderFilter])

  const fetchQrisOrders = useCallback(async () => {
    if (!isAdmin) return
    setQrisOrdersLoading(true)
    try {
      const params = new URLSearchParams({ apikey: API_KEY, limit: "50" })
      if (qrisOrderFilter) params.set("status", qrisOrderFilter)
      const res = await fetchWithAuth(`${API_BASE}/qris/admin/orders?${params}`)
      const data = await res.json()
      if (data.status !== false) setQrisOrders(data.data || [])
    } catch (_) {}
    setQrisOrdersLoading(false)
  }, [isAdmin, qrisOrderFilter])

  const fetchTicketOrders = useCallback(async () => {
    if (!isAdmin) return
    setTicketOrdersLoading(true)
    try {
      const params = new URLSearchParams({ apikey: API_KEY, limit: "50" })
      if (ticketOrderFilter) params.set("status", ticketOrderFilter)
      const res = await fetchWithAuth(`${API_BASE}/ticket/admin/orders?${params}`)
      const data = await res.json()
      if (data.status !== false) setTicketOrders(data.data || [])
    } catch (_) {}
    setTicketOrdersLoading(false)
  }, [isAdmin, ticketOrderFilter])

  const fetchQrisProducts = useCallback(async () => {
    if (!isAdmin) return
    setQrisProductsLoading(true)
    try {
      const res = await fetchWithAuth(`${API_BASE}/qris/admin/products?apikey=${API_KEY}`)
      const data = await res.json()
      if (data.status !== false) setQrisProducts(data.data || [])
    } catch (_) {}
    setQrisProductsLoading(false)
  }, [isAdmin])

  const fetchTicketShows = useCallback(async () => {
    if (!isAdmin) return
    setTicketShowsLoading(true)
    try {
      const [showsRes, configRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/ticket/admin/shows?apikey=${API_KEY}`),
        fetchWithAuth(`${API_BASE}/ticket/admin/config?apikey=${API_KEY}`),
      ])
      const showsData = await showsRes.json()
      const configData = await configRes.json()
      if (showsData.status !== false) setTicketShows(showsData.data || [])
      if (configData.status) {
        setTicketConfig(configData.data)
        setTicketConfigForm({
          default_price: String(configData.data.defaultPrice),
          default_stock: String(configData.data.defaultStock),
          default_token_max_uses: String(configData.data.defaultTokenMaxUses),
          default_token_ttl_hours: String(configData.data.defaultTokenTtlHours),
        })
      }
    } catch (_) {}
    setTicketShowsLoading(false)
  }, [isAdmin])

  const fetchLiveTokens = useCallback(async () => {
    if (!isAdmin) return
    setLiveTokensLoading(true)
    try {
      const res = await fetchWithAuth(`${API_BASE}/live/list/all?apikey=${API_KEY}&limit=50`)
      const data = await res.json()
      if (data.status !== false) setLiveTokens(data.data?.tokens || [])
    } catch (_) {}
    setLiveTokensLoading(false)
  }, [isAdmin])

  const fetchMembershipPlans = useCallback(async () => {
    if (!isAdmin) return
    setPlansLoading(true)
    try {
      const res = await fetchWithAuth(`${API_BASE}/membership/plans?apikey=${API_KEY}`)
      const data = await res.json()
      if (data.status) setMembershipPlans(data.data || [])
    } catch (_) {}
    setPlansLoading(false)
  }, [isAdmin])

  const fetchResellerApps = useCallback(async () => {
    if (!isAdmin) return
    setResellerLoading(true)
    try {
      const res = await fetchWithAuth(`${API_BASE}/reseller/applications?apikey=${API_KEY}&status=${resellerFilter}&limit=50`)
      const data = await res.json()
      if (data.status !== false) setResellerApps(data.data?.applications || [])
    } catch (_) {}
    setResellerLoading(false)
  }, [isAdmin, resellerFilter])

  // Initial load
  useEffect(() => {
    if (!loading && isAdmin) {
      fetchStats()
      fetchUsers()
    }
  }, [loading, isAdmin, fetchStats, fetchUsers])

  // Section-based lazy loading
  useEffect(() => {
    if (!isAdmin) return
    if (activeSection === "orders") fetchOrders()
    if (activeSection === "qris-orders") fetchQrisOrders()
    if (activeSection === "ticket-orders") fetchTicketOrders()
    if (activeSection === "qris-products") fetchQrisProducts()
    if (activeSection === "ticket-shows") fetchTicketShows()
    if (activeSection === "live-tokens") fetchLiveTokens()
    if (activeSection === "membership-plans") fetchMembershipPlans()
    if (activeSection === "resellers") fetchResellerApps()
  }, [activeSection, isAdmin])

  useEffect(() => {
    if (isAdmin && activeSection === "resellers") fetchResellerApps()
  }, [resellerFilter])

  // ═══════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════

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
  // Fix: kirim plan_code dengan trim & lowercase, juga coba match membership_type
  async function handleActivate() {
    if (!activateTarget || !planCode) return
    setActivateLoading(true); setActivateMsg("")
    try {
      // Cari plan yang cocok dari daftar plans (by plan_code atau membership_type)
      let resolvedPlanCode = planCode.trim().toLowerCase()

      // Jika membershipPlans sudah ada, cari plan_code yang valid
      if (membershipPlans.length > 0) {
        const matched = membershipPlans.find(
          p =>
            p.plan_code.toLowerCase() === resolvedPlanCode ||
            p.membership_type.toLowerCase() === resolvedPlanCode
        )
        if (matched) resolvedPlanCode = matched.plan_code
      }

      const res = await fetchWithAuth(`${API_BASE}/membership/activate?apikey=${API_KEY}`, {
        method: "POST",
        body: JSON.stringify({ user_id: activateTarget.user_id, plan_code: resolvedPlanCode }),
      })
      const data = await res.json()
      setActivateMsg(data.message || (data.status ? "Berhasil" : "Gagal"))
      if (data.status) {
        setActivateTarget(null); setPlanCode(""); fetchUsers(); fetchStats()
      }
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

  // ─ Update Order Status ───────────────────────────────────
  async function handleUpdateOrder() {
    if (!updateOrderTarget || !updateOrderStatus) return
    setUpdateOrderLoading(true); setUpdateOrderMsg("")
    try {
      const res = await fetchWithAuth(`${API_BASE}/order/update-status?apikey=${API_KEY}`, {
        method: "PUT",
        body: JSON.stringify({
          order_id: updateOrderTarget.order_id,
          status: updateOrderStatus,
          admin_notes: updateOrderNotes || undefined,
        }),
      })
      const data = await res.json()
      setUpdateOrderMsg(data.message)
      if (data.status) { setUpdateOrderTarget(null); fetchOrders(); fetchStats() }
    } catch (_) { setUpdateOrderMsg("Error") }
    setUpdateOrderLoading(false)
  }

  // ─ Add QRIS Product ──────────────────────────────────────
  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault()
    setProductLoading(true); setProductMsg("")
    try {
      const body: any = { ...newProduct, price: Number(newProduct.price) }
      if (newProduct.price_sale) body.price_sale = Number(newProduct.price_sale)
      else delete body.price_sale
      const res = await fetchWithAuth(`${API_BASE}/qris/admin/products?apikey=${API_KEY}`, {
        method: "POST",
        body: JSON.stringify(body),
      })
      const data = await res.json()
      setProductMsg(data.message)
      if (data.status) {
        setNewProduct({
          product_code: "", product_name: "", membership_type: "monthly",
          duration_days: 30, price: "", price_sale: "", description: "",
          stock_per_month: 100, is_active: true, is_purchase_open: true,
          is_popular: false, sort_order: 0,
        })
        fetchQrisProducts()
      }
    } catch (_) { setProductMsg("Error") }
    setProductLoading(false)
  }

  // ─ Edit QRIS Product ─────────────────────────────────────
  async function handleEditProduct() {
    if (!editProduct) return
    setEditProductLoading(true); setEditProductMsg("")
    try {
      const body: any = {
        product_name: editProduct.product_name,
        price: Number(editProduct.price),
        price_sale: editProduct.price_sale ? Number(editProduct.price_sale) : null,
        duration_days: editProduct.duration_days,
        stock_per_month: editProduct.stock_per_month,
        is_active: editProduct.is_active,
        is_purchase_open: editProduct.is_purchase_open,
        is_popular: editProduct.is_popular,
        sort_order: editProduct.sort_order,
      }
      const res = await fetchWithAuth(
        `${API_BASE}/qris/admin/products/${editProduct.product_code}?apikey=${API_KEY}`,
        { method: "PUT", body: JSON.stringify(body) }
      )
      const data = await res.json()
      setEditProductMsg(data.message)
      if (data.status) { setEditProduct(null); fetchQrisProducts() }
    } catch (_) { setEditProductMsg("Error") }
    setEditProductLoading(false)
  }

  // ─ Toggle QRIS Product field ─────────────────────────────
  async function handleToggleProduct(productCode: string, field: string) {
    try {
      await fetchWithAuth(
        `${API_BASE}/qris/admin/products/${productCode}/toggle?apikey=${API_KEY}`,
        { method: "PATCH", body: JSON.stringify({ field }) }
      )
      fetchQrisProducts()
    } catch (_) {}
  }

  // ─ Update Stock ───────────────────────────────────────────
  async function handleUpdateStock() {
    if (!stockTarget || !stockValue) return
    setStockLoading(true); setStockMsg("")
    const now = new Date()
    try {
      const res = await fetchWithAuth(`${API_BASE}/qris/admin/stock?apikey=${API_KEY}`, {
        method: "PUT",
        body: JSON.stringify({
          product_code: stockTarget.product_code,
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          total_stock: Number(stockValue),
        }),
      })
      const data = await res.json()
      setStockMsg(data.message)
      if (data.status) { setStockTarget(null); fetchQrisProducts() }
    } catch (_) { setStockMsg("Error") }
    setStockLoading(false)
  }

  // ─ Set Ticket Show Price ──────────────────────────────────
  async function handleSetPrice() {
    if (!priceTarget || !priceForm.price) return
    setPriceLoading(true); setPriceMsg("")
    try {
      const body: any = {
        price: Number(priceForm.price),
        is_active: priceForm.is_active,
        is_sale_open: priceForm.is_sale_open,
        token_max_uses: priceForm.token_max_uses,
        token_ttl_hours: priceForm.token_ttl_hours,
      }
      if (priceForm.price_sale) body.price_sale = Number(priceForm.price_sale)
      if (priceForm.max_stock) body.max_stock = Number(priceForm.max_stock)
      const res = await fetchWithAuth(
        `${API_BASE}/ticket/admin/shows/${priceTarget.show_id}/price?apikey=${API_KEY}`,
        { method: "PUT", body: JSON.stringify(body) }
      )
      const data = await res.json()
      setPriceMsg(data.message)
      if (data.status) { setPriceTarget(null); fetchTicketShows() }
    } catch (_) { setPriceMsg("Error") }
    setPriceLoading(false)
  }

  // ─ Update Ticket Config ───────────────────────────────────
  async function handleUpdateTicketConfig(e: React.FormEvent) {
    e.preventDefault()
    setTicketConfigLoading(true); setTicketConfigMsg("")
    try {
      const body: any = {}
      if (ticketConfigForm.default_price) body.default_price = Number(ticketConfigForm.default_price)
      if (ticketConfigForm.default_stock) body.default_stock = Number(ticketConfigForm.default_stock)
      if (ticketConfigForm.default_token_max_uses) body.default_token_max_uses = Number(ticketConfigForm.default_token_max_uses)
      if (ticketConfigForm.default_token_ttl_hours) body.default_token_ttl_hours = Number(ticketConfigForm.default_token_ttl_hours)
      const res = await fetchWithAuth(`${API_BASE}/ticket/admin/config?apikey=${API_KEY}`, {
        method: "PUT",
        body: JSON.stringify(body),
      })
      const data = await res.json()
      setTicketConfigMsg(data.message)
      if (data.status) fetchTicketShows()
    } catch (_) { setTicketConfigMsg("Error") }
    setTicketConfigLoading(false)
  }

  // ─ Generate Live Token ────────────────────────────────────
  async function handleGenerateToken(e: React.FormEvent) {
    e.preventDefault()
    if (!newToken.label) return
    setTokenLoading(true); setTokenMsg("")
    try {
      const body: any = {
        label: newToken.label,
        max_uses: newToken.max_uses,
        expires_hours: newToken.expires_hours,
      }
      if (newToken.show_id) body.show_id = newToken.show_id
      if (newToken.notes) body.notes = newToken.notes
      const res = await fetchWithAuth(`${API_BASE}/live/generate?apikey=${API_KEY}`, {
        method: "POST",
        body: JSON.stringify(body),
      })
      const data = await res.json()
      setTokenMsg(data.status ? `✅ Token dibuat: ${data.data?.live_id}` : data.message)
      if (data.status) { setNewToken({ label: "", max_uses: 1, expires_hours: 24, show_id: "", notes: "" }); fetchLiveTokens() }
    } catch (_) { setTokenMsg("Error") }
    setTokenLoading(false)
  }

  // ─ Deactivate Live Token ─────────────────────────────────
  async function handleDeactivateToken(liveId: string) {
    if (!confirm(`Nonaktifkan token ${liveId}?`)) return
    try {
      await fetchWithAuth(`${API_BASE}/live/${liveId}/deactivate?apikey=${API_KEY}`, { method: "PUT" })
      fetchLiveTokens()
    } catch (_) {}
  }

  // ─ Approve/Reject Reseller ───────────────────────────────
  async function handleApproveReseller() {
    if (!approveTarget) return
    setApproveLoading(true); setApproveMsg("")
    try {
      const res = await fetchWithAuth(`${API_BASE}/reseller/approve?apikey=${API_KEY}`, {
        method: "PUT",
        body: JSON.stringify({
          application_id: approveTarget.id,
          commission_rate: Number(approveCommission),
          notes: approveNotes || undefined,
        }),
      })
      const data = await res.json()
      setApproveMsg(data.message)
      if (data.status) { setApproveTarget(null); fetchResellerApps() }
    } catch (_) { setApproveMsg("Error") }
    setApproveLoading(false)
  }

  async function handleRejectReseller(app: ResellerApp) {
    const reason = prompt("Alasan penolakan (opsional):")
    if (reason === null) return
    try {
      await fetchWithAuth(`${API_BASE}/reseller/reject?apikey=${API_KEY}`, {
        method: "PUT",
        body: JSON.stringify({ application_id: app.id, notes: reason || undefined }),
      })
      fetchResellerApps()
    } catch (_) {}
  }

  // ─ Downgrade Reseller ────────────────────────────────────
  async function handleDowngradeReseller(userId: string) {
    const reason = prompt("Alasan pencabutan reseller:")
    if (!reason) return
    try {
      await fetchWithAuth(`${API_BASE}/reseller/downgrade?apikey=${API_KEY}`, {
        method: "PUT",
        body: JSON.stringify({ user_id: userId, reason }),
      })
      fetchUsers()
    } catch (_) {}
  }

  // ─ Revoke Ticket ─────────────────────────────────────────
  async function handleRevokeTicket(showId: string, userId: string) {
    const reason = prompt("Alasan pencabutan ticket:")
    if (reason === null) return
    try {
      const res = await fetchWithAuth(
        `${API_BASE}/ticket/admin/revoke/${showId}/${userId}?apikey=${API_KEY}`,
        { method: "PUT", body: JSON.stringify({ reason: reason || undefined }) }
      )
      const data = await res.json()
      alert(data.message)
      fetchTicketOrders()
    } catch (_) {}
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER: NON-ADMIN / LOADING
  // ═══════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════
  // RENDER: ADMIN
  // ═══════════════════════════════════════════════════════════

  const adminTabs = [
    { key: "overview",          label: "Overview" },
    { key: "users",             label: "Pengguna" },
    { key: "orders",            label: "Order Manual" },
    { key: "qris-orders",       label: "QRIS Orders" },
    { key: "ticket-orders",     label: "Ticket Orders" },
    { key: "qris-products",     label: "Produk QRIS" },
    { key: "ticket-shows",      label: "Harga Show" },
    { key: "live-tokens",       label: "Live Tokens" },
    { key: "membership-plans",  label: "Paket Member" },
    { key: "resellers",         label: "Reseller" },
    { key: "broadcast",         label: "Broadcast" },
  ]

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
        <button
          onClick={() => { fetchStats(); fetchUsers() }}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Tab Bar */}
      <TabBar tabs={adminTabs} active={activeSection} onChange={setActiveSection} />

      {/* ══════════════════════════════════════════════════════ */}
      {/* OVERVIEW */}
      {/* ══════════════════════════════════════════════════════ */}
      {activeSection === "overview" && (
        <div className="flex flex-col gap-6">
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
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* USERS */}
      {/* ══════════════════════════════════════════════════════ */}
      {activeSection === "users" && (
        <div className="flex flex-col gap-4">
          <SectionHeader title="Manajemen Pengguna" sub="Cari, ban, ubah role, atau aktifkan membership" />
          <div className="flex gap-2 flex-wrap">
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
                          <button
                            onClick={() => {
                              setActivateTarget(u); setPlanCode(""); setActivateMsg("")
                              // Ensure plans are loaded for resolve
                              if (membershipPlans.length === 0) fetchMembershipPlans()
                            }}
                            className="rounded border px-2 py-1 text-xs hover:bg-green-50 hover:border-green-300 hover:text-green-700 transition-colors"
                          >
                            Membership
                          </button>
                          {user.role === "owner" && (
                            <button
                              onClick={() => { setRoleTarget(u); setNewRole(u.role) }}
                              className="rounded border px-2 py-1 text-xs hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors"
                            >
                              Role
                            </button>
                          )}
                          {u.role === "reseller" && user.role === "owner" && (
                            <button
                              onClick={() => handleDowngradeReseller(u.user_id)}
                              className="rounded border px-2 py-1 text-xs hover:bg-yellow-50 hover:border-yellow-300 hover:text-yellow-700 transition-colors"
                            >
                              Downgrade
                            </button>
                          )}
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
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* ORDER MANUAL */}
      {/* ══════════════════════════════════════════════════════ */}
      {activeSection === "orders" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <SectionHeader title="Order Manual" sub="Order via payment_method (transfer, dll)" />
            <div className="flex gap-2">
              <select
                className="rounded-md border bg-background px-3 py-1.5 text-sm"
                value={orderFilter}
                onChange={e => { setOrderFilter(e.target.value); setTimeout(fetchOrders, 100) }}
              >
                <option value="">Semua status</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="failed">Failed</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button onClick={fetchOrders} className="rounded-md border bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                Refresh
              </button>
            </div>
          </div>

          {ordersLoading ? (
            <div className="h-32 rounded-xl border bg-muted/30 animate-pulse" />
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Order ID</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">User</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Paket</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Amount</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Metode</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Dibuat</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Tidak ada order</td></tr>
                  ) : orders.map(o => (
                    <tr key={o.order_id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs">{o.order_id}</td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-xs">{o.username}</p>
                        <p className="text-xs text-muted-foreground">{o.account_id}</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs">{o.plan_name}</td>
                      <td className="px-4 py-2.5 text-xs font-medium">{formatRp(o.final_amount)}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{o.payment_method}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium capitalize ${statusBadge(o.status)}`}>{o.status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDate(o.created_at)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {o.status === "pending" && (
                          <button
                            onClick={() => { setUpdateOrderTarget(o); setUpdateOrderStatus("paid"); setUpdateOrderNotes(""); setUpdateOrderMsg("") }}
                            className="rounded border px-2 py-1 text-xs hover:bg-green-50 hover:border-green-300 hover:text-green-700 transition-colors"
                          >
                            Update
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* QRIS ORDERS */}
      {/* ══════════════════════════════════════════════════════ */}
      {activeSection === "qris-orders" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <SectionHeader title="QRIS Membership Orders" sub="Order via YoBasePay QRIS" />
            <div className="flex gap-2">
              <select
                className="rounded-md border bg-background px-3 py-1.5 text-sm"
                value={qrisOrderFilter}
                onChange={e => { setQrisOrderFilter(e.target.value); setTimeout(fetchQrisOrders, 100) }}
              >
                <option value="">Semua status</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button onClick={fetchQrisOrders} className="rounded-md border bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                Refresh
              </button>
            </div>
          </div>

          {qrisOrdersLoading ? (
            <div className="h-32 rounded-xl border bg-muted/30 animate-pulse" />
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Ref ID</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">User</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Produk</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Amount</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Dibuat</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Expired</th>
                  </tr>
                </thead>
                <tbody>
                  {qrisOrders.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Tidak ada order</td></tr>
                  ) : qrisOrders.map(o => (
                    <tr key={o.ref_id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs">{o.ref_id}</td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-xs">{o.username || "—"}</p>
                        <p className="text-xs text-muted-foreground">{o.user_email}</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs">{o.product_name}</td>
                      <td className="px-4 py-2.5 text-xs font-medium">{formatRp(o.amount)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium capitalize ${statusBadge(o.status)}`}>{o.status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDate(o.created_at)}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDateTime(o.expired_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* TICKET ORDERS */}
      {/* ══════════════════════════════════════════════════════ */}
      {activeSection === "ticket-orders" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <SectionHeader title="Ticket Show Orders" sub="Order ticket theater via YoBasePay QRIS" />
            <div className="flex gap-2">
              <select
                className="rounded-md border bg-background px-3 py-1.5 text-sm"
                value={ticketOrderFilter}
                onChange={e => { setTicketOrderFilter(e.target.value); setTimeout(fetchTicketOrders, 100) }}
              >
                <option value="">Semua status</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button onClick={fetchTicketOrders} className="rounded-md border bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                Refresh
              </button>
            </div>
          </div>

          {ticketOrdersLoading ? (
            <div className="h-32 rounded-xl border bg-muted/30 animate-pulse" />
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Ref ID</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">User</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Show</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Amount</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Live Token</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Dibuat</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {ticketOrders.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Tidak ada order</td></tr>
                  ) : ticketOrders.map(o => (
                    <tr key={o.ref_id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs">{o.ref_id}</td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-xs">{o.username || "—"}</p>
                        <p className="text-xs text-muted-foreground">{o.user_email}</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs max-w-[160px] truncate">{o.show_title}</td>
                      <td className="px-4 py-2.5 text-xs font-medium">{formatRp(o.amount)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium capitalize ${statusBadge(o.status)}`}>{o.status}</span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{o.live_token_id || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDate(o.created_at)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {o.status === "paid" && o.live_token_id && (
                          <button
                            onClick={() => handleRevokeTicket(o.show_id, (o as any).user_id || "")}
                            className="rounded border px-2 py-1 text-xs hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition-colors"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* QRIS PRODUCTS */}
      {/* ══════════════════════════════════════════════════════ */}
      {activeSection === "qris-products" && (
        <div className="flex flex-col gap-6">
          {/* Add Product Form */}
          <div className="rounded-xl border p-5">
            <SectionHeader title="Tambah Produk QRIS" sub="Produk membership baru untuk pembelian via QRIS" />
            <form onSubmit={handleAddProduct} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Product Code *</label>
                <input className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="cth: MONTHLY_2025" value={newProduct.product_code}
                  onChange={e => setNewProduct(p => ({ ...p, product_code: e.target.value }))} required />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Nama Produk *</label>
                <input className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="cth: Membership Monthly" value={newProduct.product_name}
                  onChange={e => setNewProduct(p => ({ ...p, product_name: e.target.value }))} required />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipe Membership *</label>
                <select className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={newProduct.membership_type}
                  onChange={e => setNewProduct(p => ({ ...p, membership_type: e.target.value }))}>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                  <option value="vip">VIP</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Durasi (hari) *</label>
                <input type="number" className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={newProduct.duration_days}
                  onChange={e => setNewProduct(p => ({ ...p, duration_days: Number(e.target.value) }))} required />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Harga Normal (Rp) *</label>
                <input type="number" className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="50000" value={newProduct.price}
                  onChange={e => setNewProduct(p => ({ ...p, price: e.target.value }))} required />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Harga Sale (Rp, opsional)</label>
                <input type="number" className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="45000" value={newProduct.price_sale}
                  onChange={e => setNewProduct(p => ({ ...p, price_sale: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Stok per Bulan</label>
                <input type="number" className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={newProduct.stock_per_month}
                  onChange={e => setNewProduct(p => ({ ...p, stock_per_month: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Sort Order</label>
                <input type="number" className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={newProduct.sort_order}
                  onChange={e => setNewProduct(p => ({ ...p, sort_order: Number(e.target.value) }))} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Deskripsi</label>
                <input className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Deskripsi produk..." value={newProduct.description}
                  onChange={e => setNewProduct(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="flex gap-4 sm:col-span-2 flex-wrap">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" className="rounded" checked={newProduct.is_active}
                    onChange={e => setNewProduct(p => ({ ...p, is_active: e.target.checked }))} />
                  Aktif
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" className="rounded" checked={newProduct.is_purchase_open}
                    onChange={e => setNewProduct(p => ({ ...p, is_purchase_open: e.target.checked }))} />
                  Pembelian Terbuka
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" className="rounded" checked={newProduct.is_popular}
                    onChange={e => setNewProduct(p => ({ ...p, is_popular: e.target.checked }))} />
                  Populer
                </label>
              </div>
              {productMsg && <p className={`sm:col-span-2 text-xs ${productMsg.includes("berhasil") ? "text-green-600" : "text-red-500"}`}>{productMsg}</p>}
              <div className="sm:col-span-2">
                <button type="submit" disabled={productLoading}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {productLoading ? "Menyimpan..." : "Tambah Produk"}
                </button>
              </div>
            </form>
          </div>

          {/* Product List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <SectionHeader title="Daftar Produk QRIS" sub="Kelola produk membership QRIS" />
              <button onClick={fetchQrisProducts} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors">
                Refresh
              </button>
            </div>
            {qrisProductsLoading ? (
              <div className="h-32 rounded-xl border bg-muted/30 animate-pulse" />
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Produk</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Tipe</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Harga</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Stok</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {qrisProducts.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Tidak ada produk</td></tr>
                    ) : qrisProducts.map(p => (
                      <tr key={p.product_code} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-xs">{p.product_name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{p.product_code}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium capitalize ${membershipBadge(p.membership_type)}`}>{p.membership_type}</span>
                          <p className="text-xs text-muted-foreground mt-0.5">{p.duration_days} hari</p>
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          <p className="font-medium">{formatRp(p.price)}</p>
                          {p.price_sale && <p className="text-green-600">{formatRp(p.price_sale)} (sale)</p>}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          <p>{p.stock_remaining} sisa</p>
                          <p className="text-muted-foreground">{p.sold_count}/{p.current_stock} terjual</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${p.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                            {p.is_active ? "Aktif" : "Nonaktif"}
                          </span>
                          <span className={`ml-1 inline-flex rounded px-2 py-0.5 text-xs font-medium ${p.is_purchase_open ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                            {p.is_purchase_open ? "Open" : "Closed"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex justify-end gap-1 flex-wrap">
                            <button
                              onClick={() => { setEditProduct({ ...p }); setEditProductMsg("") }}
                              className="rounded border px-2 py-1 text-xs hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors"
                            >Edit</button>
                            <button
                              onClick={() => { setStockTarget(p); setStockValue(String(p.current_stock)); setStockMsg("") }}
                              className="rounded border px-2 py-1 text-xs hover:bg-yellow-50 hover:border-yellow-300 hover:text-yellow-700 transition-colors"
                            >Stok</button>
                            <button
                              onClick={() => handleToggleProduct(p.product_code, "is_active")}
                              className="rounded border px-2 py-1 text-xs hover:bg-muted/50 transition-colors"
                            >{p.is_active ? "Nonaktifkan" : "Aktifkan"}</button>
                            <button
                              onClick={() => handleToggleProduct(p.product_code, "is_purchase_open")}
                              className="rounded border px-2 py-1 text-xs hover:bg-muted/50 transition-colors"
                            >{p.is_purchase_open ? "Tutup Beli" : "Buka Beli"}</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* TICKET SHOWS */}
      {/* ══════════════════════════════════════════════════════ */}
      {activeSection === "ticket-shows" && (
        <div className="flex flex-col gap-6">
          {/* Global Ticket Config */}
          <div className="rounded-xl border p-5">
            <SectionHeader title="Global Config Ticket" sub="Default untuk show yang belum dikonfigurasi manual" />
            {ticketConfig && (
              <div className="grid grid-cols-2 gap-3 mb-4 sm:grid-cols-4">
                <StatCard label="Default Price" value={formatRp(ticketConfig.defaultPrice)} />
                <StatCard label="Default Stock" value={ticketConfig.defaultStock} />
                <StatCard label="Token Max Uses" value={ticketConfig.defaultTokenMaxUses} />
                <StatCard label="Token TTL (jam)" value={ticketConfig.defaultTokenTtlHours} />
              </div>
            )}
            <form onSubmit={handleUpdateTicketConfig} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Default Price (Rp)</label>
                <input type="number" className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={ticketConfigForm.default_price}
                  onChange={e => setTicketConfigForm(p => ({ ...p, default_price: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Default Stock</label>
                <input type="number" className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={ticketConfigForm.default_stock}
                  onChange={e => setTicketConfigForm(p => ({ ...p, default_stock: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Token Max Uses</label>
                <input type="number" className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={ticketConfigForm.default_token_max_uses}
                  onChange={e => setTicketConfigForm(p => ({ ...p, default_token_max_uses: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Token TTL (jam)</label>
                <input type="number" className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={ticketConfigForm.default_token_ttl_hours}
                  onChange={e => setTicketConfigForm(p => ({ ...p, default_token_ttl_hours: e.target.value }))} />
              </div>
              {ticketConfigMsg && <p className="col-span-2 sm:col-span-4 text-xs text-green-600">{ticketConfigMsg}</p>}
              <div className="col-span-2 sm:col-span-4">
                <button type="submit" disabled={ticketConfigLoading}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {ticketConfigLoading ? "Menyimpan..." : "Simpan Config"}
                </button>
              </div>
            </form>
          </div>

          {/* Show List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <SectionHeader title="Daftar Show & Harga Ticket" sub="Set harga per show dari IDN Plus" />
              <button onClick={fetchTicketShows} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors">Refresh</button>
            </div>
            {ticketShowsLoading ? (
              <div className="h-32 rounded-xl border bg-muted/30 animate-pulse" />
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Show</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Harga</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Stok</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Config</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ticketShows.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Tidak ada show tersedia</td></tr>
                    ) : ticketShows.map(s => (
                      <tr key={s.show_id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-xs max-w-[180px] truncate">{s.title}</p>
                          <p className="text-xs text-muted-foreground font-mono">{s.show_id}</p>
                          {s.scheduled_at && <p className="text-xs text-muted-foreground">{formatDate(s.scheduled_at)}</p>}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium capitalize ${s.status === "live" ? "bg-red-100 text-red-700" : s.status === "scheduled" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>{s.status}</span>
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          <p className="font-medium">{formatRp(s.ticket.effective_price)}</p>
                          {s.ticket.price_sale && <p className="text-muted-foreground line-through">{formatRp(s.ticket.price)}</p>}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          <p>{s.ticket.stock_remaining} sisa</p>
                          {s.ticket.is_sold_out && <span className="text-red-500">Habis</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${s.ticket.is_configured ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                            {s.ticket.is_configured ? "Custom" : "Default"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => {
                              setPriceTarget(s)
                              setPriceForm({
                                price: String(s.ticket.price),
                                price_sale: s.ticket.price_sale ? String(s.ticket.price_sale) : "",
                                max_stock: s.ticket.max_stock ? String(s.ticket.max_stock) : "",
                                is_active: s.ticket.is_available,
                                is_sale_open: s.ticket.is_available,
                                token_max_uses: s.ticket.token_max_uses,
                                token_ttl_hours: s.ticket.token_ttl_hours,
                              })
                              setPriceMsg("")
                            }}
                            className="rounded border px-2 py-1 text-xs hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors"
                          >
                            Set Harga
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* LIVE TOKENS */}
      {/* ══════════════════════════════════════════════════════ */}
      {activeSection === "live-tokens" && (
        <div className="flex flex-col gap-6">
          {/* Generate Token Form */}
          <div className="rounded-xl border p-5">
            <SectionHeader title="Generate Live Token" sub="Token akses live tanpa login (untuk reseller, giveaway, dll)" />
            <form onSubmit={handleGenerateToken} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Label Token *</label>
                <input className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="cth: Ticket Show 2025-07-01" value={newToken.label}
                  onChange={e => setNewToken(p => ({ ...p, label: e.target.value }))} required />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Show ID (opsional)</label>
                <input className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="cth: show_abc123" value={newToken.show_id}
                  onChange={e => setNewToken(p => ({ ...p, show_id: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Max Uses</label>
                <input type="number" min={1} className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={newToken.max_uses}
                  onChange={e => setNewToken(p => ({ ...p, max_uses: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Berlaku (jam)</label>
                <input type="number" min={1} className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={newToken.expires_hours}
                  onChange={e => setNewToken(p => ({ ...p, expires_hours: Number(e.target.value) }))} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Catatan (opsional)</label>
                <input className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Catatan internal token ini" value={newToken.notes}
                  onChange={e => setNewToken(p => ({ ...p, notes: e.target.value }))} />
              </div>
              {tokenMsg && <p className={`sm:col-span-2 text-xs ${tokenMsg.startsWith("✅") ? "text-green-600" : "text-red-500"}`}>{tokenMsg}</p>}
              <div className="sm:col-span-2">
                <button type="submit" disabled={tokenLoading}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {tokenLoading ? "Membuat..." : "Generate Token"}
                </button>
              </div>
            </form>
          </div>

          {/* Token List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <SectionHeader title="Daftar Live Token" sub="Semua token akses live" />
              <button onClick={fetchLiveTokens} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors">Refresh</button>
            </div>
            {liveTokensLoading ? (
              <div className="h-32 rounded-xl border bg-muted/30 animate-pulse" />
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Live ID</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Label</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Uses</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Expired</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveTokens.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Tidak ada token</td></tr>
                    ) : liveTokens.map(t => (
                      <tr key={t.live_id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-xs">{t.live_id}</td>
                        <td className="px-4 py-2.5">
                          <p className="text-xs font-medium">{t.label}</p>
                          {t.notes && <p className="text-xs text-muted-foreground">{t.notes}</p>}
                        </td>
                        <td className="px-4 py-2.5 text-xs">{t.uses_count}/{t.max_uses ?? "∞"}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDateTime(t.expires_at)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                            !t.is_active ? "bg-gray-100 text-gray-500" :
                            new Date(t.expires_at) < new Date() ? "bg-red-100 text-red-600" :
                            "bg-green-100 text-green-700"
                          }`}>
                            {!t.is_active ? "Nonaktif" : new Date(t.expires_at) < new Date() ? "Expired" : "Aktif"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {t.is_active && new Date(t.expires_at) > new Date() && (
                            <button
                              onClick={() => handleDeactivateToken(t.live_id)}
                              className="rounded border px-2 py-1 text-xs hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition-colors"
                            >
                              Nonaktifkan
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* MEMBERSHIP PLANS */}
      {/* ══════════════════════════════════════════════════════ */}
      {activeSection === "membership-plans" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <SectionHeader title="Paket Membership" sub="Daftar plan untuk order manual & aktivasi admin" />
            <button onClick={fetchMembershipPlans} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors">Refresh</button>
          </div>
          <div className="rounded-xl border p-4 bg-yellow-50 border-yellow-200">
            <p className="text-xs text-yellow-800">
              <strong>Catatan:</strong> Saat aktivasi membership manual, gunakan <code className="bg-yellow-100 px-1 rounded">plan_code</code> persis seperti di kolom Plan Code di bawah. Aktivasi manual mendukung pencocokan by <code className="bg-yellow-100 px-1 rounded">plan_code</code> maupun <code className="bg-yellow-100 px-1 rounded">membership_type</code>.
            </p>
          </div>
          {plansLoading ? (
            <div className="h-32 rounded-xl border bg-muted/30 animate-pulse" />
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Plan Code</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Nama</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Tipe</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Durasi</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Harga</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {membershipPlans.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Tidak ada paket</td></tr>
                  ) : membershipPlans.map(p => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs font-medium text-primary">{p.plan_code}</td>
                      <td className="px-4 py-2.5 text-xs">
                        {p.plan_name}
                        {p.is_popular && <span className="ml-1 inline-flex rounded px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700">Populer</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium capitalize ${membershipBadge(p.membership_type)}`}>{p.membership_type}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs">{p.duration_days} hari</td>
                      <td className="px-4 py-2.5 text-xs">
                        <p className="font-medium">{formatRp(p.price)}</p>
                        {p.price_sale && <p className="text-green-600">{formatRp(p.price_sale)} (sale)</p>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${p.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {p.is_active ? "Aktif" : "Nonaktif"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* RESELLERS */}
      {/* ══════════════════════════════════════════════════════ */}
      {activeSection === "resellers" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <SectionHeader title="Reseller Applications" sub="Kelola pengajuan dan status reseller" />
            <div className="flex gap-2">
              <select
                className="rounded-md border bg-background px-3 py-1.5 text-sm"
                value={resellerFilter}
                onChange={e => setResellerFilter(e.target.value)}
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
              <button onClick={fetchResellerApps} className="rounded-md border bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                Refresh
              </button>
            </div>
          </div>

          {resellerLoading ? (
            <div className="h-32 rounded-xl border bg-muted/30 animate-pulse" />
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">User</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Alasan</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Bank</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Diajukan</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {resellerApps.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Tidak ada pengajuan</td></tr>
                  ) : resellerApps.map(a => (
                    <tr key={a.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-xs">{a.username}</p>
                        <p className="text-xs text-muted-foreground">{a.email}</p>
                        <p className="text-xs text-muted-foreground font-mono">{a.account_id}</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs max-w-[200px]">
                        <p className="line-clamp-2 text-muted-foreground">{a.reason || "—"}</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {a.bank_name ? (
                          <>
                            <p className="font-medium">{a.bank_name}</p>
                            <p className="text-muted-foreground">{a.bank_account}</p>
                            <p className="text-muted-foreground">{a.bank_holder}</p>
                          </>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium capitalize ${statusBadge(a.status)}`}>{a.status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDate(a.created_at)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {a.status === "pending" && (
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => { setApproveTarget(a); setApproveCommission("10"); setApproveNotes(""); setApproveMsg("") }}
                              className="rounded border px-2 py-1 text-xs hover:bg-green-50 hover:border-green-300 hover:text-green-700 transition-colors"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleRejectReseller(a)}
                              className="rounded border px-2 py-1 text-xs hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition-colors"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* BROADCAST */}
      {/* ══════════════════════════════════════════════════════ */}
      {activeSection === "broadcast" && (
        <div className="max-w-2xl">
          <SectionHeader title="Broadcast Notifikasi" sub="Kirim notifikasi ke semua user atau per role" />
          <div className="rounded-xl border p-5">
            <form onSubmit={handleBroadcast} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Judul *</label>
                <input
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Judul notifikasi"
                  value={broadcast.title}
                  onChange={e => setBroadcast(p => ({ ...p, title: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Pesan *</label>
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  rows={4}
                  placeholder="Isi pesan notifikasi..."
                  value={broadcast.message}
                  onChange={e => setBroadcast(p => ({ ...p, message: e.target.value }))}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipe</label>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={broadcast.type}
                    onChange={e => setBroadcast(p => ({ ...p, type: e.target.value as any }))}
                  >
                    <option value="info">Info</option>
                    <option value="success">Success</option>
                    <option value="warning">Warning</option>
                    <option value="error">Error</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Target Role</label>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={broadcast.target_role}
                    onChange={e => setBroadcast(p => ({ ...p, target_role: e.target.value }))}
                  >
                    <option value="">Semua user</option>
                    <option value="member">Member</option>
                    <option value="reseller">Reseller</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Kategori</label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={broadcast.category}
                  onChange={e => setBroadcast(p => ({ ...p, category: e.target.value }))}
                >
                  <option value="system">System</option>
                  <option value="payment">Payment</option>
                  <option value="membership">Membership</option>
                  <option value="security">Security</option>
                  <option value="ticket">Ticket</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Action URL (opsional)</label>
                <input
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="cth: /membership atau /live"
                  value={broadcast.action_url}
                  onChange={e => setBroadcast(p => ({ ...p, action_url: e.target.value }))}
                />
              </div>
              {broadcastMsg && (
                <p className={`text-xs ${broadcastMsg.toLowerCase().includes("gagal") ? "text-red-500" : "text-green-600"}`}>{broadcastMsg}</p>
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
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* MODALS */}
      {/* ══════════════════════════════════════════════════════ */}

      {/* Modal: Ban */}
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
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Ban hingga (kosongkan = permanen)</label>
                <input
                  type="datetime-local"
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={banUntil}
                  onChange={e => setBanUntil(e.target.value)}
                />
              </div>
              {banMsg && <p className="text-xs text-red-500">{banMsg}</p>}
              <div className="flex gap-2 mt-1">
                <button onClick={handleBan} disabled={banLoading || !banReason}
                  className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors">
                  {banLoading ? "Memproses..." : "Ban User"}
                </button>
                <button onClick={() => { setBanTarget(null); setBanMsg("") }}
                  className="flex-1 rounded-md border px-4 py-2 text-sm hover:bg-muted/50 transition-colors">
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Set Role */}
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
                <button onClick={handleSetRole} disabled={roleLoading}
                  className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {roleLoading ? "Memproses..." : "Simpan"}
                </button>
                <button onClick={() => { setRoleTarget(null); setRoleMsg("") }}
                  className="flex-1 rounded-md border px-4 py-2 text-sm hover:bg-muted/50 transition-colors">
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Activate Membership — FIXED */}
      {activateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-2xl border bg-background p-6 shadow-xl mx-4">
            <h3 className="font-semibold mb-1">Aktifkan Membership</h3>
            <p className="text-sm text-muted-foreground mb-4">
              @{activateTarget.username} · saat ini: <span className="capitalize font-medium">{activateTarget.membership_type}</span>
            </p>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Plan Code *</label>
                {membershipPlans.length > 0 ? (
                  <select
                    className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={planCode}
                    onChange={e => setPlanCode(e.target.value)}
                  >
                    <option value="">-- Pilih Paket --</option>
                    {membershipPlans.filter(p => p.is_active).map(p => (
                      <option key={p.id} value={p.plan_code}>
                        {p.plan_name} ({p.plan_code}) — {p.duration_days} hari — {formatRp(p.price)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="monthly / weekly / yearly / vip"
                      value={planCode}
                      onChange={e => setPlanCode(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={fetchMembershipPlans}
                      className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                    >
                      Load Plans
                    </button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Masukkan plan_code dari tabel Paket Member.
                </p>
              </div>
              {activateMsg && (
                <p className={`text-xs ${activateMsg.toLowerCase().includes("berhasil") ? "text-green-600" : "text-red-500"}`}>
                  {activateMsg}
                </p>
              )}
              <div className="flex gap-2">
                <button onClick={handleActivate} disabled={activateLoading || !planCode}
                  className="flex-1 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors">
                  {activateLoading ? "Memproses..." : "Aktifkan"}
                </button>
                <button onClick={() => { setActivateTarget(null); setActivateMsg("") }}
                  className="flex-1 rounded-md border px-4 py-2 text-sm hover:bg-muted/50 transition-colors">
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Update Order Status */}
      {updateOrderTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-2xl border bg-background p-6 shadow-xl mx-4">
            <h3 className="font-semibold mb-1">Update Status Order</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {updateOrderTarget.order_id} · {updateOrderTarget.plan_name}
            </p>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Status Baru *</label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={updateOrderStatus}
                  onChange={e => setUpdateOrderStatus(e.target.value)}
                >
                  <option value="paid">Paid (Konfirmasi)</option>
                  <option value="failed">Failed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="refunded">Refunded</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Catatan Admin</label>
                <input
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Catatan opsional..."
                  value={updateOrderNotes}
                  onChange={e => setUpdateOrderNotes(e.target.value)}
                />
              </div>
              {updateOrderMsg && <p className="text-xs text-muted-foreground">{updateOrderMsg}</p>}
              <div className="flex gap-2">
                <button onClick={handleUpdateOrder} disabled={updateOrderLoading || !updateOrderStatus}
                  className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {updateOrderLoading ? "Memproses..." : "Update"}
                </button>
                <button onClick={() => { setUpdateOrderTarget(null); setUpdateOrderMsg("") }}
                  className="flex-1 rounded-md border px-4 py-2 text-sm hover:bg-muted/50 transition-colors">
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit QRIS Product */}
      {editProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-2xl border bg-background p-6 shadow-xl mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold mb-1">Edit Produk</h3>
            <p className="text-sm text-muted-foreground mb-4 font-mono">{editProduct.product_code}</p>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Nama Produk</label>
                <input className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={editProduct.product_name}
                  onChange={e => setEditProduct(p => p ? { ...p, product_name: e.target.value } : p)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Harga Normal (Rp)</label>
                  <input type="number" className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={editProduct.price}
                    onChange={e => setEditProduct(p => p ? { ...p, price: e.target.value } : p)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Harga Sale (kosongkan = hapus)</label>
                  <input type="number" className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={editProduct.price_sale ?? ""}
                    onChange={e => setEditProduct(p => p ? { ...p, price_sale: e.target.value || null } : p)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Durasi (hari)</label>
                  <input type="number" className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={editProduct.duration_days}
                    onChange={e => setEditProduct(p => p ? { ...p, duration_days: Number(e.target.value) } : p)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Stok per Bulan</label>
                  <input type="number" className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={editProduct.stock_per_month}
                    onChange={e => setEditProduct(p => p ? { ...p, stock_per_month: Number(e.target.value) } : p)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Sort Order</label>
                  <input type="number" className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={editProduct.sort_order}
                    onChange={e => setEditProduct(p => p ? { ...p, sort_order: Number(e.target.value) } : p)} />
                </div>
              </div>
              <div className="flex gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" className="rounded" checked={editProduct.is_active}
                    onChange={e => setEditProduct(p => p ? { ...p, is_active: e.target.checked } : p)} />
                  Aktif
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" className="rounded" checked={editProduct.is_purchase_open}
                    onChange={e => setEditProduct(p => p ? { ...p, is_purchase_open: e.target.checked } : p)} />
                  Pembelian Terbuka
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" className="rounded" checked={editProduct.is_popular}
                    onChange={e => setEditProduct(p => p ? { ...p, is_popular: e.target.checked } : p)} />
                  Populer
                </label>
              </div>
              {editProductMsg && <p className={`text-xs ${editProductMsg.includes("berhasil") ? "text-green-600" : "text-red-500"}`}>{editProductMsg}</p>}
              <div className="flex gap-2">
                <button onClick={handleEditProduct} disabled={editProductLoading}
                  className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {editProductLoading ? "Menyimpan..." : "Simpan"}
                </button>
                <button onClick={() => { setEditProduct(null); setEditProductMsg("") }}
                  className="flex-1 rounded-md border px-4 py-2 text-sm hover:bg-muted/50 transition-colors">
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Update Stock */}
      {stockTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-2xl border bg-background p-6 shadow-xl mx-4">
            <h3 className="font-semibold mb-1">Update Stok Bulan Ini</h3>
            <p className="text-sm text-muted-foreground mb-4">{stockTarget.product_name} · Terjual: {stockTarget.sold_count}</p>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Total Stok Bulan Ini</label>
                <input type="number" min={stockTarget.sold_count}
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={stockValue}
                  onChange={e => setStockValue(e.target.value)} />
                <p className="text-xs text-muted-foreground mt-1">Minimal {stockTarget.sold_count} (sudah terjual)</p>
              </div>
              {stockMsg && <p className={`text-xs ${stockMsg.includes("berhasil") ? "text-green-600" : "text-red-500"}`}>{stockMsg}</p>}
              <div className="flex gap-2">
                <button onClick={handleUpdateStock} disabled={stockLoading || !stockValue}
                  className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {stockLoading ? "Menyimpan..." : "Update Stok"}
                </button>
                <button onClick={() => { setStockTarget(null); setStockMsg("") }}
                  className="flex-1 rounded-md border px-4 py-2 text-sm hover:bg-muted/50 transition-colors">
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Set Ticket Show Price */}
      {priceTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-2xl border bg-background p-6 shadow-xl mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold mb-1">Set Harga Ticket Show</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-full truncate">{priceTarget.title}</p>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Harga Normal (Rp) *</label>
                  <input type="number" className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={priceForm.price}
                    onChange={e => setPriceForm(p => ({ ...p, price: e.target.value }))} required />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Harga Sale (opsional)</label>
                  <input type="number" className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={priceForm.price_sale}
                    onChange={e => setPriceForm(p => ({ ...p, price_sale: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Max Stock</label>
                  <input type="number" className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={priceForm.max_stock}
                    onChange={e => setPriceForm(p => ({ ...p, max_stock: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Token Max Uses</label>
                  <input type="number" min={1} className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={priceForm.token_max_uses}
                    onChange={e => setPriceForm(p => ({ ...p, token_max_uses: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Token TTL (jam)</label>
                  <input type="number" min={1} className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={priceForm.token_ttl_hours}
                    onChange={e => setPriceForm(p => ({ ...p, token_ttl_hours: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="flex gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" className="rounded" checked={priceForm.is_active}
                    onChange={e => setPriceForm(p => ({ ...p, is_active: e.target.checked }))} />
                  Ticket Aktif
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" className="rounded" checked={priceForm.is_sale_open}
                    onChange={e => setPriceForm(p => ({ ...p, is_sale_open: e.target.checked }))} />
                  Penjualan Terbuka
                </label>
              </div>
              {priceMsg && <p className={`text-xs ${priceMsg.includes("berhasil") ? "text-green-600" : "text-red-500"}`}>{priceMsg}</p>}
              <div className="flex gap-2">
                <button onClick={handleSetPrice} disabled={priceLoading || !priceForm.price}
                  className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {priceLoading ? "Menyimpan..." : "Simpan Harga"}
                </button>
                <button onClick={() => { setPriceTarget(null); setPriceMsg("") }}
                  className="flex-1 rounded-md border px-4 py-2 text-sm hover:bg-muted/50 transition-colors">
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Approve Reseller */}
      {approveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-2xl border bg-background p-6 shadow-xl mx-4">
            <h3 className="font-semibold mb-1">Approve Reseller</h3>
            <p className="text-sm text-muted-foreground mb-4">@{approveTarget.username} · {approveTarget.email}</p>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Komisi (%)</label>
                <input type="number" min={0} max={100} step={0.5}
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={approveCommission}
                  onChange={e => setApproveCommission(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Catatan (opsional)</label>
                <input
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Catatan untuk reseller..."
                  value={approveNotes}
                  onChange={e => setApproveNotes(e.target.value)} />
              </div>
              {approveMsg && <p className={`text-xs ${approveMsg.includes("berhasil") || approveMsg.toLowerCase().includes("approved") ? "text-green-600" : "text-red-500"}`}>{approveMsg}</p>}
              <div className="flex gap-2">
                <button onClick={handleApproveReseller} disabled={approveLoading}
                  className="flex-1 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors">
                  {approveLoading ? "Memproses..." : "Approve"}
                </button>
                <button onClick={() => { setApproveTarget(null); setApproveMsg("") }}
                  className="flex-1 rounded-md border px-4 py-2 text-sm hover:bg-muted/50 transition-colors">
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
