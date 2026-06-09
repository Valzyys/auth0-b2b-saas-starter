"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { toast } from "sonner"
import { fetchWithAuth, getCookie } from "@/hooks/useAuth"
import { User } from "@/hooks/useAuth"

const API_BASE = "https://v5.jkt48connect.com/api/team48"
const API_KEY  = "JKTCONNECT"
const POLL_INTERVAL_MS = 4000

// ─── Types ────────────────────────────────────────────────────

interface QrisProduct {
  id: number
  product_code: string
  product_name: string
  membership_type: string
  duration_days: number
  price: string
  price_sale: string | null
  description: string | null
  features: string[] | string | null
  is_popular: boolean
  is_purchase_open: boolean
  stock_remaining: number
}

interface MembershipStatus {
  membership_type: string
  is_active: boolean
  membership_started_at: string | null
  membership_expired_at: string | null
  days_remaining: number
}

interface QrisOrder {
  ref_id: string
  product_code: string
  product_name: string
  membership_type: string
  duration_days: number
  amount: string | number
  formatted_amount: string
  status: string
  paid_at: string | null
  expired_at: string
  created_at: string
}

interface ActivePayment {
  ref_id: string
  ybp_trx_id: string
  product_name: string
  membership_type: string
  amount: number
  formatted_amount: string
  qris_content: string | null
  qr_image: string | null
  expired_at: string
  ybp_expired_at: string | null
  timeout_minutes: number
}

// ─── Helpers ──────────────────────────────────────────────────

function formatRp(amount: string | number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", minimumFractionDigits: 0,
  }).format(Number(amount))
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-"
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta",
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
    case "expired":   return "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
    case "cancelled": return "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
    default:          return "bg-gray-100 text-gray-500"
  }
}

function useCountdown(targetDate: string | null) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    if (!targetDate) return
    const calc = () => Math.max(0, Math.floor((new Date(targetDate).getTime() - Date.now()) / 1000))
    setSecs(calc())
    const t = setInterval(() => setSecs(calc()), 1000)
    return () => clearInterval(t)
  }, [targetDate])
  return secs
}

// ─── QRIS Payment Modal ───────────────────────────────────────

function QrisModal({
  payment,
  onClose,
  onSuccess,
}: {
  payment: ActivePayment
  onClose: () => void
  onSuccess: (membershipExpiredAt: string | null) => void
}) {
  const [pollStatus, setPollStatus] = useState<"pending" | "paid" | "expired" | "cancelled">("pending")
  const [cancelling, setCancelling] = useState(false)
  const [qrImage, setQrImage] = useState<string | null>(payment.qr_image)
  const [qrisContent, setQrisContent] = useState<string | null>(payment.qris_content)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Countdown: always 1 hour from when the modal was opened (matches QRIS timeout)
  const deadlineRef = useRef<string>(new Date(Date.now() + 60 * 60 * 1000).toISOString())
  const secsLeft = useCountdown(deadlineRef.current)

  const mins = Math.floor(secsLeft / 60)
  const secs = secsLeft % 60

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  useEffect(() => {
    if (pollStatus !== "pending") return

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/qris/check/${payment.ref_id}?apikey=${API_KEY}`)
        const data = await res.json()

        if (!data.status) return

        // /qris/check returns order_status at root level, order detail inside data[0]
        const st = (data.order_status ?? data.data?.[0]?.order_status ?? "") as string
        const orderDetail = Array.isArray(data.data) ? data.data[0] : data.data

        if (orderDetail?.qr_image) setQrImage(orderDetail.qr_image)
        if (orderDetail?.qris_content) setQrisContent(orderDetail.qris_content)

        if (st === "paid") {
          stopPoll()
          setPollStatus("paid")
          toast.success("🎉 Pembayaran terkonfirmasi! Membership aktif.")
          setTimeout(() => onSuccess(orderDetail?.membership_expired_at ?? null), 1500)
        } else if (st === "expired") {
          stopPoll()
          setPollStatus("expired")
          toast.error("QRIS expired. Silakan buat order baru.")
        } else if (st === "cancelled") {
          stopPoll()
          setPollStatus("cancelled")
        }
      } catch (_) {}
    }

    poll()
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS)
    return stopPoll
  }, [payment.ref_id, pollStatus, stopPoll, onSuccess])

  // Countdown hits zero → mark as expired
  useEffect(() => {
    if (secsLeft === 0 && pollStatus === "pending") {
      stopPoll()
      setPollStatus("expired")
    }
  }, [secsLeft, pollStatus, stopPoll])

  const handleCancel = async () => {
    setCancelling(true)
    try {
      await fetchWithAuth(`${API_BASE}/qris/cancel/${payment.ref_id}?apikey=${API_KEY}`, {
        method: "DELETE",
      })
      stopPoll()
      setPollStatus("cancelled")
      toast.info("Order dibatalkan.")
    } catch {
      toast.error("Gagal membatalkan order.")
    } finally {
      setCancelling(false)
    }
  }

  const handleCopy = () => {
    if (!qrisContent) return
    navigator.clipboard.writeText(qrisContent)
    toast.success("QRIS content disalin!")
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={(e) => { if (e.target === e.currentTarget && pollStatus !== "pending") onClose() }}
    >
      <div className="w-full max-w-sm rounded-xl border border-border bg-background shadow-xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Pembayaran QRIS</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{payment.product_name}</p>
          </div>
          {pollStatus !== "pending" && (
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="px-5 py-5 space-y-4">

          {/* ── Paid state ── */}
          {pollStatus === "paid" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="text-center space-y-1">
                <p className="font-semibold">Pembayaran Berhasil!</p>
                <p className="text-sm text-muted-foreground">Membership kamu sudah aktif.</p>
              </div>
              <button onClick={onClose} className="mt-2 w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                Tutup
              </button>
            </div>
          )}

          {/* ── Expired state ── */}
          {pollStatus === "expired" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                <svg className="h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="text-center space-y-1">
                <p className="font-semibold">QRIS Expired</p>
                <p className="text-sm text-muted-foreground">Waktu pembayaran habis. Silakan buat order baru.</p>
              </div>
              <button onClick={onClose} className="mt-2 w-full rounded-md border border-input py-2.5 text-sm font-medium hover:bg-accent">
                Tutup
              </button>
            </div>
          )}

          {/* ── Cancelled state ── */}
          {pollStatus === "cancelled" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div className="text-center space-y-1">
                <p className="font-semibold">Order Dibatalkan</p>
                <p className="text-sm text-muted-foreground">Buat order baru untuk melanjutkan.</p>
              </div>
              <button onClick={onClose} className="mt-2 w-full rounded-md border border-input py-2.5 text-sm font-medium hover:bg-accent">
                Tutup
              </button>
            </div>
          )}

          {/* ── Pending state ── */}
          {pollStatus === "pending" && (
            <>
              {/* Jumlah */}
              <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-2.5">
                <span className="text-sm text-muted-foreground">Total bayar</span>
                <span className="font-bold text-lg">{payment.formatted_amount}</span>
              </div>

              {/* Countdown */}
              <div className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
                secsLeft < 120
                  ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400"
                  : "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400"
              }`}>
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Berakhir dalam {mins}m {String(secs).padStart(2, "0")}s
              </div>

              {/* QR Image */}
              <div className="flex flex-col items-center gap-3">
                {qrImage ? (
                  <div className="relative">
                    <img
                      src={qrImage}
                      alt="QR Code Pembayaran"
                      className="h-52 w-52 rounded-lg border border-border object-contain"
                    />
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                      <span className="relative inline-flex h-4 w-4 rounded-full bg-yellow-500" />
                    </span>
                  </div>
                ) : (
                  <div className="flex h-52 w-52 items-center justify-center rounded-lg border border-border bg-muted">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                  </div>
                )}
                <p className="text-xs text-muted-foreground text-center">
                  Scan QR dengan aplikasi e-wallet atau mobile banking
                </p>
              </div>

              {/* Copy QRIS content */}
              {qrisContent && (
                <button
                  onClick={handleCopy}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Salin QRIS String
                </button>
              )}

              {/* Ref ID */}
              <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium">Ref ID:</span>{" "}
                <span className="font-mono break-all">{payment.ref_id}</span>
              </div>

              {/* Polling indicator */}
              <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-flex h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
                Menunggu konfirmasi pembayaran...
              </div>

              {/* Cancel */}
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="w-full rounded-md py-2 text-xs font-medium text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
              >
                {cancelling ? "Membatalkan..." : "Batalkan Order"}
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────

export default function MembershipPage() {
  const [user, setUser]                       = useState<User | null>(null)
  const [products, setProducts]               = useState<QrisProduct[]>([])
  const [status, setStatus]                   = useState<MembershipStatus | null>(null)
  const [history, setHistory]                 = useState<QrisOrder[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [loadingBuy, setLoadingBuy]           = useState<string | null>(null)
  const [activePayment, setActivePayment]     = useState<ActivePayment | null>(null)
  const [tab, setTab]                         = useState<"plans" | "orders">("plans")

  // ── Load user ─────────────────────────────────────────────
  useEffect(() => {
    const raw = getCookie("t48_user")
    if (raw) { try { setUser(JSON.parse(raw)) } catch {} }
  }, [])

  // ── Fetch products ────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/qris/products?apikey=${API_KEY}`)
      .then(r => r.json())
      .then(d => { if (d.status) setProducts(d.data) })
      .catch(() => toast.error("Gagal memuat paket membership"))
      .finally(() => setLoadingProducts(false))
  }, [])

  // ── Fetch membership status & order history ───────────────
  const fetchUserData = useCallback((u: User) => {
    fetchWithAuth(`${API_BASE}/membership/status/${u.user_id}?apikey=${API_KEY}`)
      .then(r => r.json())
      .then(d => { if (d.status) setStatus(d.data) })
      .catch(() => {})

    fetchWithAuth(`${API_BASE}/qris/history?apikey=${API_KEY}&limit=20`)
      .then(r => r.json())
      .then(d => { if (d.status) setHistory(d.data.orders) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (user) fetchUserData(user)
  }, [user, fetchUserData])

  // ── Check for resumable pending order ────────────────────
  useEffect(() => {
    if (!user || activePayment) return

    fetchWithAuth(`${API_BASE}/qris/resume/${user.user_id}?apikey=${API_KEY}`)
      .then(r => r.json())
      .then(d => {
        if (d.status && d.data?.length > 0) {
          const pending = d.data[0]
          toast(
            `Ada pembayaran tertunda untuk ${pending.product_name}`,
            {
              action: {
                label: "Lanjutkan",
                onClick: () => setActivePayment({
                  ref_id:           pending.ref_id,
                  ybp_trx_id:       "",
                  product_name:     pending.product_name,
                  membership_type:  pending.membership_type,
                  amount:           Number(pending.amount),
                  formatted_amount: pending.formatted_amount,
                  qris_content:     pending.qris_content,
                  qr_image:         pending.qr_image,
                  expired_at:       pending.expired_at,
                  ybp_expired_at:   null,
                  timeout_minutes:  60,
                }),
              },
              duration: 8000,
            }
          )
        }
      })
      .catch(() => {})
  }, [user, activePayment])

  const membershipActive = status?.is_active ?? false

  // ── Purchase ──────────────────────────────────────────────
  const handleBuy = async (product: QrisProduct) => {
    if (!user) { toast.error("Login terlebih dahulu"); return }
    if (!product.is_purchase_open) { toast.error("Pembelian produk ini sedang ditutup"); return }
    if (product.stock_remaining <= 0) { toast.error("Stok bulan ini sudah habis"); return }

    setLoadingBuy(product.product_code)
    try {
      const res  = await fetchWithAuth(`${API_BASE}/qris/buy?apikey=${API_KEY}`, {
        method: "POST",
        body:   JSON.stringify({ product_code: product.product_code }),
      })
      const data = await res.json()

      if (!data.status) { toast.error(data.message || "Gagal membuat order"); return }

      setActivePayment({
        ref_id:           data.data.ref_id,
        ybp_trx_id:       data.data.ybp_trx_id,
        product_name:     data.data.product_name,
        membership_type:  data.data.membership_type,
        amount:           Number(data.data.amount),
        formatted_amount: data.data.formatted_amount,
        qris_content:     data.data.qris_content,
        qr_image:         data.data.qr_image,
        expired_at:       data.data.expired_at,
        ybp_expired_at:   data.data.ybp_expired_at,
        timeout_minutes:  data.data.timeout_minutes,
      })
    } catch {
      toast.error("Terjadi kesalahan jaringan. Coba lagi.")
    } finally {
      setLoadingBuy(null)
    }
  }

  // ── After payment success ─────────────────────────────────
  const handlePaymentSuccess = useCallback((_membershipExpiredAt: string | null) => {
    setActivePayment(null)
    if (user) {
      fetchWithAuth(`${API_BASE}/membership/status/${user.user_id}?apikey=${API_KEY}`)
        .then(r => r.json())
        .then(d => { if (d.status) setStatus(d.data) })
        .catch(() => {})
      fetchWithAuth(`${API_BASE}/qris/history?apikey=${API_KEY}&limit=20`)
        .then(r => r.json())
        .then(d => { if (d.status) setHistory(d.data.orders) })
        .catch(() => {})
    }
    setTab("orders")
  }, [user])

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">

      {/* ── Status Card ── */}
      {user && status && (
        <div className={`rounded-xl border p-5 ${
          membershipActive
            ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
            : "border-border bg-muted/40"
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  membershipActive
                    ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                    : "bg-muted text-muted-foreground"
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${membershipActive ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
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

      {/* ── Tabs ── */}
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
            {t === "plans" ? "Paket Membership" : "Riwayat Pembelian"}
          </button>
        ))}
      </div>

      {/* ── Tab: Plans ── */}
      {tab === "plans" && (
        <>
          {loadingProducts ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-72 rounded-xl border border-border bg-muted animate-pulse" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              Tidak ada paket tersedia saat ini.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {products.map(product => {
                const features = parseFeatures(product.features)
                const hasSale  = product.price_sale && Number(product.price_sale) < Number(product.price)
                const price    = product.price_sale ?? product.price
                const isBuying = loadingBuy === product.product_code
                const noStock  = product.stock_remaining <= 0
                const closed   = !product.is_purchase_open

                return (
                  <div
                    key={product.product_code}
                    className={`relative flex flex-col rounded-xl border bg-background p-5 transition-shadow hover:shadow-md ${
                      product.is_popular ? "border-primary ring-1 ring-primary" : "border-border"
                    } ${(noStock || closed) ? "opacity-60" : ""}`}
                  >
                    {product.is_popular && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground whitespace-nowrap">
                        Paling Populer
                      </span>
                    )}

                    {product.stock_remaining <= 10 && product.stock_remaining > 0 && (
                      <span className="absolute top-3 right-3 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                        Sisa {product.stock_remaining}
                      </span>
                    )}

                    <div className="mb-4 space-y-1">
                      <h3 className="font-semibold text-base">{product.product_name}</h3>
                      <p className="text-xs text-muted-foreground capitalize">
                        {product.membership_type} · {product.duration_days} hari
                      </p>
                    </div>

                    <div className="mb-4 flex items-baseline gap-2">
                      <span className="text-2xl font-bold">{formatRp(price)}</span>
                      {hasSale && (
                        <span className="text-sm line-through text-muted-foreground">{formatRp(product.price)}</span>
                      )}
                    </div>

                    {product.description && (
                      <p className="mb-3 text-xs text-muted-foreground leading-relaxed">{product.description}</p>
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

                    <div className="mb-3 flex items-center gap-1.5">
                      <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">QRIS</span>
                      <span className="text-xs text-muted-foreground">· Bayar langsung, aktif otomatis</span>
                    </div>

                    <button
                      onClick={() => handleBuy(product)}
                      disabled={isBuying || noStock || closed || !user}
                      className={`mt-auto w-full rounded-md py-2.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        product.is_popular
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "border border-input bg-background hover:bg-accent"
                      }`}
                    >
                      {isBuying ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Memproses...
                        </span>
                      ) : noStock   ? "Stok Habis"
                        : closed    ? "Pembelian Ditutup"
                        : !user     ? "Login untuk Membeli"
                        : membershipActive ? "Perpanjang"
                        : "Beli Sekarang"}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <div className="rounded-lg bg-muted/50 border border-border px-4 py-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">ℹ️ Cara pembayaran QRIS</p>
            <p>1. Klik "Beli Sekarang" → QR Code akan muncul</p>
            <p>2. Scan QR dengan aplikasi e-wallet atau m-banking apapun</p>
            <p>3. Membership aktif <strong>otomatis</strong> setelah pembayaran dikonfirmasi</p>
          </div>
        </>
      )}

      {/* ── Tab: Orders ── */}
      {tab === "orders" && (
        <>
          {!user ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              Login untuk melihat riwayat pembelian.
            </div>
          ) : history.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              Belum ada riwayat pembelian.
            </div>
          ) : (
            <div className="space-y-3">
              {history.map(order => (
                <div key={order.ref_id} className="rounded-xl border border-border bg-background p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground">{order.ref_id}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(order.status)}`}>
                          {order.status}
                        </span>
                      </div>
                      <p className="font-medium text-sm">{order.product_name}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {order.membership_type} · {order.duration_days} hari · QRIS
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-sm">{formatRp(order.amount)}</p>
                      {order.paid_at && (
                        <p className="text-xs text-green-600 mt-0.5">Dibayar {formatDate(order.paid_at)}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDate(order.created_at)}</p>
                    </div>
                  </div>

                  {order.status === "pending" && (
                    <div className="mt-3 flex items-center justify-between rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 px-3 py-2">
                      <p className="text-xs text-yellow-800 dark:text-yellow-300">
                        Menunggu pembayaran · Expired {formatDate(order.expired_at)}
                      </p>
                      <button
                        onClick={() => {
                          fetchWithAuth(`${API_BASE}/qris/resume/${user!.user_id}?apikey=${API_KEY}`)
                            .then(r => r.json())
                            .then(d => {
                              const found = d.data?.find((o: { ref_id: string }) => o.ref_id === order.ref_id)
                              if (found) {
                                setActivePayment({
                                  ref_id:           found.ref_id,
                                  ybp_trx_id:       "",
                                  product_name:     found.product_name,
                                  membership_type:  found.membership_type,
                                  amount:           Number(found.amount),
                                  formatted_amount: found.formatted_amount,
                                  qris_content:     found.qris_content,
                                  qr_image:         found.qr_image,
                                  expired_at:       found.expired_at,
                                  ybp_expired_at:   null,
                                  timeout_minutes:  60,
                                })
                              }
                            })
                            .catch(() => toast.error("Gagal memuat data pembayaran"))
                        }}
                        className="ml-3 shrink-0 rounded-md bg-yellow-500 px-3 py-1 text-xs font-medium text-white hover:bg-yellow-600 transition-colors"
                      >
                        Lanjutkan Bayar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── QRIS Modal ── */}
      {activePayment && (
        <QrisModal
          payment={activePayment}
          onClose={() => setActivePayment(null)}
          onSuccess={handlePaymentSuccess}
        />
      )}

    </div>
  )
}
