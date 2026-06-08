"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { fetchWithAuth, getCookie } from "@/hooks/useAuth"
import { User } from "@/hooks/useAuth"

const API_BASE = "https://v5.jkt48connect.com/api/team48"
const API_KEY  = "JKTCONNECT"

// ─── Types ───────────────────────────────────────────────────

interface Plan {
  id: number
  plan_code: string
  plan_name: string
  membership_type: string
  duration_days: number
  price: string
  price_sale: string | null
  description: string | null
  features: string[] | string | null
  is_popular: boolean
}

interface MembershipStatus {
  membership_type: string
  is_active: boolean
  membership_started_at: string | null
  membership_expired_at: string | null
  days_remaining: number
}

interface Order {
  order_id: string
  plan_code: string
  plan_name: string
  original_amount: string
  discount_amount: string
  final_amount: string
  status: string
  payment_method: string
  promo_code: string | null
  order_expired_at: string
  created_at: string
}

// ─── Helpers ─────────────────────────────────────────────────

function formatRp(amount: string | number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(Number(amount))
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-"
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "numeric", month: "long", year: "numeric",
    timeZone: "Asia/Jakarta",
  })
}

function parseFeatures(features: string[] | string | null): string[] {
  if (!features) return []
  if (Array.isArray(features)) return features
  try { return JSON.parse(features) } catch { return [String(features)] }
}

function statusColor(status: string) {
  switch (status) {
    case "paid":      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
    case "pending":   return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
    case "expired":   return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
    case "cancelled": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
    case "failed":    return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
    case "refunded":  return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
    default:          return "bg-gray-100 text-gray-600"
  }
}

const PAYMENT_METHODS = [
  { value: "transfer_bca",     label: "Transfer BCA" },
  { value: "transfer_mandiri", label: "Transfer Mandiri" },
  { value: "transfer_bni",     label: "Transfer BNI" },
  { value: "transfer_bri",     label: "Transfer BRI" },
  { value: "dana",             label: "DANA" },
  { value: "gopay",            label: "GoPay" },
  { value: "ovo",              label: "OVO" },
  { value: "qris",             label: "QRIS" },
]

// ─── Order Modal ──────────────────────────────────────────────

function OrderModal({
  plan,
  onClose,
  userId,
}: {
  plan: Plan
  onClose: () => void
  userId: string
}) {
  const [paymentMethod, setPaymentMethod] = useState("transfer_bca")
  const [promoCode, setPromoCode]         = useState("")
  const [notes, setNotes]                 = useState("")
  const [loading, setLoading]             = useState(false)
  const [created, setCreated]             = useState<Order | null>(null)

  const finalPrice = plan.price_sale ?? plan.price

  const handleOrder = async () => {
    setLoading(true)
    try {
      const res = await fetchWithAuth(`${API_BASE}/order/create?apikey=${API_KEY}`, {
        method: "POST",
        body: JSON.stringify({
          plan_code:      plan.plan_code,
          payment_method: paymentMethod,
          promo_code:     promoCode.trim() || undefined,
          notes:          notes.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!data.status) {
        toast.error(data.message || "Gagal membuat order")
        return
      }
      setCreated(data.data)
      toast.success("Order berhasil dibuat!")
    } catch {
      toast.error("Terjadi kesalahan. Coba lagi.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold">
            {created ? "Order Berhasil Dibuat" : `Beli ${plan.plan_name}`}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {!created ? (
            <>
              {/* Ringkasan plan */}
              <div className="rounded-lg bg-muted p-4 space-y-1">
                <p className="font-medium">{plan.plan_name}</p>
                <p className="text-sm text-muted-foreground">{plan.duration_days} hari</p>
                <div className="flex items-baseline gap-2 pt-1">
                  <span className="text-xl font-bold">{formatRp(finalPrice)}</span>
                  {plan.price_sale && (
                    <span className="text-sm line-through text-muted-foreground">{formatRp(plan.price)}</span>
                  )}
                </div>
              </div>

              {/* Metode pembayaran */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Metode Pembayaran</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Kode promo */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Kode Promo <span className="text-muted-foreground">(opsional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Masukkan kode promo"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Catatan */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Catatan <span className="text-muted-foreground">(opsional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Catatan tambahan untuk admin"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Setelah order dibuat, lakukan pembayaran dan tunggu konfirmasi dari admin (maks. 1×24 jam).
                Order akan expired otomatis dalam 24 jam jika belum dikonfirmasi.
              </p>

              <button
                onClick={handleOrder}
                disabled={loading}
                className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {loading ? "Memproses..." : `Buat Order — ${formatRp(finalPrice)}`}
              </button>
            </>
          ) : (
            /* Sukses — tampilkan detail order */
            <div className="space-y-4">
              <div className="flex items-center justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>

              <div className="rounded-lg border border-border divide-y divide-border text-sm">
                {[
                  ["Order ID",        created.order_id],
                  ["Paket",           created.plan_name],
                  ["Metode",          PAYMENT_METHODS.find(m => m.value === created.payment_method)?.label ?? created.payment_method],
                  ["Total",           formatRp(created.final_amount)],
                  ...(Number(created.discount_amount) > 0
                    ? [["Diskon", `-${formatRp(created.discount_amount)}`]]
                    : []),
                  ["Berlaku hingga",  formatDate(created.order_expired_at)],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between px-4 py-2.5">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium text-right max-w-[55%] break-all">{value}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-3 text-xs text-yellow-800 dark:text-yellow-300 space-y-1">
                <p className="font-medium">Langkah selanjutnya:</p>
                <p>Lakukan transfer sejumlah <strong>{formatRp(created.final_amount)}</strong> menggunakan metode yang dipilih, lalu konfirmasi ke admin via WhatsApp atau email dengan menyertakan <strong>Order ID</strong> di atas.</p>
              </div>

              <button
                onClick={onClose}
                className="w-full rounded-md border border-input bg-background py-2.5 text-sm font-medium hover:bg-accent transition-colors"
              >
                Tutup
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────

export default function MembershipPage() {
  const [user, setUser]             = useState<User | null>(null)
  const [plans, setPlans]           = useState<Plan[]>([])
  const [status, setStatus]         = useState<MembershipStatus | null>(null)
  const [orders, setOrders]         = useState<Order[]>([])
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [tab, setTab]               = useState<"plans" | "orders">("plans")

  useEffect(() => {
    const raw = getCookie("t48_user")
    if (raw) {
      try { setUser(JSON.parse(raw)) } catch {}
    }
  }, [])

  // Fetch plans (public)
  useEffect(() => {
    fetch(`${API_BASE}/membership/plans?apikey=${API_KEY}`)
      .then((r) => r.json())
      .then((d) => { if (d.status) setPlans(d.data) })
      .catch(() => toast.error("Gagal memuat paket membership"))
      .finally(() => setLoadingPlans(false))
  }, [])

  // Fetch membership status & orders (auth)
  useEffect(() => {
    if (!user) return

    fetchWithAuth(`${API_BASE}/membership/status/${user.user_id}?apikey=${API_KEY}`)
      .then((r) => r.json())
      .then((d) => { if (d.status) setStatus(d.data) })
      .catch(() => {})

    fetchWithAuth(`${API_BASE}/order/list?apikey=${API_KEY}&limit=10`)
      .then((r) => r.json())
      .then((d) => { if (d.status) setOrders(d.data.orders) })
      .catch(() => {})
  }, [user])

  const membershipActive = status?.is_active ?? false

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">

      {/* Status Card */}
      {user && status && (
        <div className={`rounded-xl border p-5 ${
          membershipActive
            ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
            : "border-border bg-muted/40"
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  membershipActive
                    ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                    : "bg-muted text-muted-foreground"
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${membershipActive ? "bg-green-500" : "bg-gray-400"}`} />
                  {membershipActive ? "Aktif" : "Tidak Aktif"}
                </span>
                <span className="text-sm font-medium capitalize">{status.membership_type}</span>
              </div>
              {membershipActive && status.membership_expired_at ? (
                <p className="text-sm text-muted-foreground">
                  Berakhir {formatDate(status.membership_expired_at)}
                  <span className="ml-2 font-medium text-foreground">({status.days_remaining} hari lagi)</span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Kamu belum memiliki membership aktif</p>
              )}
            </div>
            {membershipActive && (
              <button
                onClick={() => setTab("plans")}
                className="text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80 shrink-0"
              >
                Perpanjang
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tab */}
      <div className="flex border-b border-border gap-6">
        {(["plans", "orders"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "plans" ? "Paket Membership" : "Riwayat Order"}
          </button>
        ))}
      </div>

      {/* Tab: Plans */}
      {tab === "plans" && (
        <>
          {loadingPlans ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-64 rounded-xl border border-border bg-muted animate-pulse" />
              ))}
            </div>
          ) : plans.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              Tidak ada paket tersedia saat ini.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => {
                const features = parseFeatures(plan.features)
                const hasSale  = plan.price_sale && Number(plan.price_sale) < Number(plan.price)
                const price    = plan.price_sale ?? plan.price

                return (
                  <div
                    key={plan.plan_code}
                    className={`relative flex flex-col rounded-xl border bg-background p-5 transition-shadow hover:shadow-md ${
                      plan.is_popular ? "border-primary ring-1 ring-primary" : "border-border"
                    }`}
                  >
                    {plan.is_popular && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground whitespace-nowrap">
                        Paling Populer
                      </span>
                    )}

                    <div className="mb-4 space-y-1">
                      <h3 className="font-semibold text-base">{plan.plan_name}</h3>
                      <p className="text-xs text-muted-foreground capitalize">{plan.membership_type} · {plan.duration_days} hari</p>
                    </div>

                    <div className="mb-4 flex items-baseline gap-2">
                      <span className="text-2xl font-bold">{formatRp(price)}</span>
                      {hasSale && (
                        <span className="text-sm line-through text-muted-foreground">{formatRp(plan.price)}</span>
                      )}
                    </div>

                    {plan.description && (
                      <p className="mb-3 text-xs text-muted-foreground leading-relaxed">{plan.description}</p>
                    )}

                    {features.length > 0 && (
                      <ul className="mb-5 flex-1 space-y-1.5">
                        {features.map((f, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <svg className="mt-0.5 h-4 w-4 shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}

                    <button
                      onClick={() => {
                        if (!user) {
                          toast.error("Login terlebih dahulu untuk membeli membership")
                          return
                        }
                        setSelectedPlan(plan)
                      }}
                      className={`mt-auto w-full rounded-md py-2.5 text-sm font-medium transition-colors ${
                        plan.is_popular
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "border border-input bg-background hover:bg-accent"
                      }`}
                    >
                      {membershipActive ? "Perpanjang" : "Pilih Paket"}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground pt-2">
            Setelah membuat order, hubungi admin untuk konfirmasi pembayaran.
            Membership aktif setelah admin memverifikasi pembayaran.
          </p>
        </>
      )}

      {/* Tab: Orders */}
      {tab === "orders" && (
        <>
          {!user ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              Login untuk melihat riwayat order.
            </div>
          ) : orders.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              Belum ada order. Pilih paket membership untuk memulai.
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => (
                <div key={order.order_id} className="rounded-xl border border-border bg-background p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground">{order.order_id}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(order.status)}`}>
                          {order.status}
                        </span>
                      </div>
                      <p className="font-medium text-sm">{order.plan_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {PAYMENT_METHODS.find(m => m.value === order.payment_method)?.label ?? order.payment_method}
                        {order.promo_code && ` · Promo: ${order.promo_code}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-sm">{formatRp(order.final_amount)}</p>
                      {Number(order.discount_amount) > 0 && (
                        <p className="text-xs text-green-600">-{formatRp(order.discount_amount)}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDate(order.created_at)}</p>
                    </div>
                  </div>

                  {order.status === "pending" && (
                    <div className="mt-3 rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 px-3 py-2 text-xs text-yellow-800 dark:text-yellow-300">
                      Menunggu konfirmasi pembayaran dari admin. Order expired: {formatDate(order.order_expired_at)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Order Modal */}
      {selectedPlan && (
        <OrderModal
          plan={selectedPlan}
          userId={user?.user_id ?? ""}
          onClose={() => {
            setSelectedPlan(null)
            // Refresh orders setelah order baru
            if (user) {
              fetchWithAuth(`${API_BASE}/order/list?apikey=${API_KEY}&limit=10`)
                .then((r) => r.json())
                .then((d) => { if (d.status) setOrders(d.data.orders) })
                .catch(() => {})
            }
          }}
        />
      )}
    </div>
  )
}
