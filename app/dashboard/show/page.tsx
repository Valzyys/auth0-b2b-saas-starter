"use client"

import { useEffect, useState, useRef, useCallback } from "react"

// ─── API Constants ────────────────────────────────────────────
const API_BASE   = "https://v5.jkt48connect.com/api/team48"
const API_KEY    = "JKTCONNECT"
const POLL_MS    = 4000

// ─── Types ────────────────────────────────────────────────────

interface TicketInfo {
  is_configured:   boolean
  is_available:    boolean
  is_sold_out:     boolean
  price:           number
  price_sale:      number | null
  effective_price: number
  stock_remaining: number
  token_max_uses:  number
  token_ttl_hours: number
}

interface Show {
  show_id:             string | null
  slug:                string
  title:               string
  image_url:           string | null
  status:              string
  scheduled_at:        number | null
  live_at:             number | null
  idn_room_identifier: string | null
  idn_playback_url:    string | null
  idn_gold_price:      number | null
  description:         string | null
  ticket:              TicketInfo
}

interface ActivePayment {
  ref_id:           string
  ybp_trx_id:       string
  show_id:          string
  show_title:       string
  amount:           number
  formatted_amount: string
  qris_content:     string | null
  qr_image:         string | null
  expired_at:       string
  timeout_minutes:  number
}

// ─── Helpers ──────────────────────────────────────────────────

function formatRp(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", minimumFractionDigits: 0,
  }).format(amount)
}

function formatDate(ts: number) {
  if (!ts) return "-"
  return new Date(ts * 1000).toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "Asia/Jakarta",
  })
}

function formatTime(ts: number) {
  if (!ts) return "-"
  return new Date(ts * 1000).toLocaleTimeString("id-ID", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
  }) + " WIB"
}

function getAccessToken(): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(/(?:^|;\s*)t48_access_token=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : null
}

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = getAccessToken()
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  })
}

// ─── Sub-components ───────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    scheduled: { label: "Terjadwal", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    live:      { label: "Live",      cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 animate-pulse" },
    ended:     { label: "Selesai",   cls: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
  }
  const s = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-500" }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
      {status === "live" && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
      {s.label}
    </span>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden animate-pulse">
      <div className="h-48 bg-muted" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-3 bg-muted rounded w-1/2" />
        <div className="h-3 bg-muted rounded w-2/3" />
        <div className="h-8 bg-muted rounded w-full mt-2" />
      </div>
    </div>
  )
}

// ─── QRIS Payment Modal ───────────────────────────────────────

function QrisModal({
  payment,
  onClose,
  onSuccess,
}: {
  payment: ActivePayment
  onClose: () => void
  onSuccess: () => void
}) {
  const [pollStatus, setPollStatus] = useState<"pending" | "paid" | "expired" | "cancelled">("pending")
  const [cancelling, setCancelling] = useState(false)
  const [qrImage, setQrImage]       = useState<string | null>(payment.qr_image)
  const [qrisContent, setQrisContent] = useState<string | null>(payment.qris_content)
  const [secsLeft, setSecsLeft]     = useState(3600)
  const [copied, setCopied]         = useState(false)
  const pollRef                     = useRef<ReturnType<typeof setInterval> | null>(null)

  const mins = Math.floor(secsLeft / 60)
  const secs = secsLeft % 60

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  useEffect(() => {
    if (pollStatus !== "pending") return

    const poll = async () => {
      try {
        const res  = await fetch(`${API_BASE}/ticket/check/${payment.ref_id}?apikey=${API_KEY}`)
        const data = await res.json()
        if (!data.status) return

        const st          = data.order_status as string
        const orderDetail = data.data

        if (orderDetail?.qr_image)     setQrImage(orderDetail.qr_image)
        if (orderDetail?.qris_content) setQrisContent(orderDetail.qris_content)
        if (typeof orderDetail?.time_remaining?.seconds === "number")
          setSecsLeft(orderDetail.time_remaining.seconds)

        if (st === "paid") {
          stopPoll(); setPollStatus("paid")
          setTimeout(() => onSuccess(), 1500)
        } else if (st === "expired") {
          stopPoll(); setPollStatus("expired")
        } else if (st === "cancelled") {
          stopPoll(); setPollStatus("cancelled")
        }
      } catch (_) {}
    }

    poll()
    pollRef.current = setInterval(poll, POLL_MS)
    return stopPoll
  }, [payment.ref_id, pollStatus, stopPoll, onSuccess])

  // local countdown tick
  useEffect(() => {
    if (pollStatus !== "pending" || secsLeft <= 0) return
    const t = setInterval(() => setSecsLeft(p => {
      if (p <= 1) { clearInterval(t); return 0 }
      return p - 1
    }), 1000)
    return () => clearInterval(t)
  }, [pollStatus])

  useEffect(() => {
    if (secsLeft === 0 && pollStatus === "pending") { stopPoll(); setPollStatus("expired") }
  }, [secsLeft, pollStatus, stopPoll])

  const handleCancel = async () => {
    setCancelling(true)
    try {
      await fetchWithAuth(`${API_BASE}/ticket/cancel/${payment.ref_id}?apikey=${API_KEY}`, { method: "DELETE" })
      stopPoll(); setPollStatus("cancelled")
    } catch (_) {} finally { setCancelling(false) }
  }

  const handleCopy = () => {
    if (!qrisContent) return
    navigator.clipboard.writeText(qrisContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={e => { if (e.target === e.currentTarget && pollStatus !== "pending") onClose() }}
    >
      <div className="w-full max-w-sm rounded-xl border border-border bg-background shadow-xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Pembayaran Ticket</h2>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{payment.show_title}</p>
          </div>
          {pollStatus !== "pending" && (
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-3">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="px-5 py-5 space-y-4">

          {/* ── Paid ── */}
          {pollStatus === "paid" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="text-center">
                <p className="font-semibold">Ticket Berhasil Dibeli!</p>
                <p className="text-sm text-muted-foreground mt-1">Lihat tiket kamu di halaman My Tickets.</p>
              </div>
              <button onClick={onClose} className="mt-2 w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                Tutup
              </button>
            </div>
          )}

          {/* ── Expired ── */}
          {pollStatus === "expired" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                <svg className="h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="font-semibold">Waktu Habis</p>
                <p className="text-sm text-muted-foreground mt-1">QRIS expired. Silakan beli ticket lagi.</p>
              </div>
              <button onClick={onClose} className="mt-2 w-full rounded-md border border-input py-2.5 text-sm font-medium hover:bg-accent">
                Tutup
              </button>
            </div>
          )}

          {/* ── Cancelled ── */}
          {pollStatus === "cancelled" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div className="text-center">
                <p className="font-semibold">Order Dibatalkan</p>
                <p className="text-sm text-muted-foreground mt-1">Buat order baru untuk melanjutkan.</p>
              </div>
              <button onClick={onClose} className="mt-2 w-full rounded-md border border-input py-2.5 text-sm font-medium hover:bg-accent">
                Tutup
              </button>
            </div>
          )}

          {/* ── Pending ── */}
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

              {/* QR Code */}
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
                  Scan QR dengan e-wallet atau mobile banking manapun
                </p>
              </div>

              {/* Copy QRIS */}
              {qrisContent && (
                <button
                  onClick={handleCopy}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  {copied ? "Tersalin!" : "Salin QRIS String"}
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

// ─── Show Card ────────────────────────────────────────────────

function ShowCard({
  show,
  onBuy,
  buying,
  isLoggedIn,
}: {
  show:      Show
  onBuy:     (show: Show) => void
  buying:    boolean
  isLoggedIn: boolean
}) {
  const [imgError, setImgError] = useState(false)
  const t = show.ticket

  const soldOut    = t.is_sold_out
  const unavailable = !t.is_available
  const hasSale    = t.price_sale !== null && t.price_sale < t.price
  const isEnded    = show.status === "ended"

  return (
    <div className={`group flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow ${(soldOut || isEnded) ? "opacity-70" : ""}`}>

      {/* Thumbnail */}
      <div className="relative h-48 overflow-hidden bg-muted shrink-0">
        {!imgError && show.image_url ? (
          <img
            src={show.image_url}
            alt={show.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <svg className="h-10 w-10 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.362a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
          </div>
        )}

        {/* Status badge */}
        <div className="absolute top-2.5 left-2.5">
          <StatusBadge status={show.status} />
        </div>

        {/* IDN Gold price badge */}
        {show.idn_gold_price != null && (
          <div className="absolute top-2.5 right-2.5 rounded-full bg-black/70 px-2.5 py-0.5 text-xs font-medium text-yellow-300">
            {show.idn_gold_price} gold
          </div>
        )}

        {/* Sold out overlay */}
        {soldOut && !isEnded && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <span className="rounded-full bg-red-500 px-3 py-1 text-xs font-semibold text-white">
              Ticket Habis
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-2.5 p-4 bg-card">

        {/* Title */}
        <h3 className="font-semibold text-sm leading-snug line-clamp-2 text-foreground">
          {show.title}
        </h3>

        {/* Schedule */}
        <div className="space-y-1">
          {show.scheduled_at != null && show.scheduled_at > 0 && (
            <>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>{formatDate(show.scheduled_at)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{formatTime(show.scheduled_at)}</span>
              </div>
            </>
          )}
          {show.live_at != null && show.live_at > 0 && show.status === "live" && (
            <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <span>Live sejak {formatTime(show.live_at)}</span>
            </div>
          )}
        </div>

        {/* Description */}
        {show.description && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 whitespace-pre-line">
            {show.description.trim()}
          </p>
        )}

        {/* Ticket price + stock */}
        {!isEnded && (
          <div className="mt-auto pt-1 space-y-2">
            {/* Price row */}
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-1.5">
                <span className="font-bold text-sm text-foreground">
                  {formatRp(t.effective_price)}
                </span>
                {hasSale && (
                  <span className="text-xs line-through text-muted-foreground">
                    {formatRp(t.price)}
                  </span>
                )}
              </div>
              {/* Stock indicator */}
              {!soldOut && t.stock_remaining <= 10 && t.stock_remaining > 0 && (
                <span className="rounded-full bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-400">
                  Sisa {t.stock_remaining}
                </span>
              )}
            </div>

            {/* Buy button */}
            <button
              onClick={() => onBuy(show)}
              disabled={buying || soldOut || unavailable || !isLoggedIn || !show.show_id}
              className={`w-full rounded-md py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                show.status === "live"
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {buying
                ? <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Memproses...
                  </span>
                : !isLoggedIn
                ? "Login untuk Beli Ticket"
                : !show.show_id
                ? "Belum Tersedia"
                : soldOut
                ? "Ticket Habis"
                : unavailable
                ? "Penjualan Ditutup"
                : show.status === "live"
                ? "🔴 Beli Ticket Sekarang"
                : "Beli Ticket"}
            </button>
          </div>
        )}

        {/* Ended state */}
        {isEnded && (
          <div className="mt-auto pt-1">
            <div className="w-full rounded-md bg-muted py-2 text-center text-xs text-muted-foreground">
              Show Telah Selesai
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────

export default function SchedulePage() {
  const [shows, setShows]               = useState<Show[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [filter, setFilter]             = useState<"all" | "scheduled" | "live" | "ended">("all")
  const [buying, setBuying]             = useState<string | null>(null)
  const [activePayment, setActivePayment] = useState<ActivePayment | null>(null)
  const [buyError, setBuyError]         = useState<string | null>(null)
  const [isLoggedIn, setIsLoggedIn]     = useState(false)

  // Detect login from cookie
  useEffect(() => {
    setIsLoggedIn(!!getAccessToken())
  }, [])

  // Fetch shows
  useEffect(() => {
    fetch(`${API_BASE}/ticket/shows?apikey=${API_KEY}`)
      .then(r => r.json())
      .then(d => {
        if (d.status && Array.isArray(d.data)) {
          setShows(d.data)
        } else {
          setError("Gagal memuat jadwal show.")
        }
      })
      .catch(() => setError("Terjadi kesalahan jaringan."))
      .finally(() => setLoading(false))
  }, [])

  const filtered = filter === "all" ? shows : shows.filter(s => s.status === filter)

  const tabs: { key: typeof filter; label: string }[] = [
    { key: "all",       label: "Semua" },
    { key: "live",      label: "Live" },
    { key: "scheduled", label: "Terjadwal" },
    { key: "ended",     label: "Selesai" },
  ]

  const handleBuy = async (show: Show) => {
    if (!show.show_id) return
    setBuyError(null)
    setBuying(show.show_id)

    try {
      const res  = await fetchWithAuth(`${API_BASE}/ticket/buy?apikey=${API_KEY}`, {
        method: "POST",
        body:   JSON.stringify({ show_id: show.show_id }),
      })
      const data = await res.json()

      // Resume pending order
      if (!data.status && data.resume) {
        const resume = data.resume
        setActivePayment({
          ref_id:           resume.ref_id,
          ybp_trx_id:       "",
          show_id:          show.show_id,
          show_title:       show.title,
          amount:           resume.amount_to_pay,
          formatted_amount: resume.formatted_amount,
          qris_content:     resume.qris_content,
          qr_image:         resume.qr_image,
          expired_at:       resume.expired_at,
          timeout_minutes:  60,
        })
        return
      }

      if (!data.status) {
        setBuyError(data.message || "Gagal membuat order. Coba lagi.")
        return
      }

      setActivePayment({
        ref_id:           data.data.ref_id,
        ybp_trx_id:       data.data.ybp_trx_id,
        show_id:          show.show_id,
        show_title:       show.title,
        amount:           data.data.amount,
        formatted_amount: data.data.formatted_amount,
        qris_content:     data.data.qris_content,
        qr_image:         data.data.qr_image,
        expired_at:       data.data.expired_at,
        timeout_minutes:  data.data.timeout_minutes,
      })
    } catch {
      setBuyError("Terjadi kesalahan jaringan. Coba lagi.")
    } finally {
      setBuying(null)
    }
  }

  const handlePaymentSuccess = useCallback(() => {
    setActivePayment(null)
    // Refresh show list
    fetch(`${API_BASE}/ticket/shows?apikey=${API_KEY}`)
      .then(r => r.json())
      .then(d => { if (d.status && Array.isArray(d.data)) setShows(d.data) })
      .catch(() => {})
  }, [])

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Jadwal Show</h1>
        <p className="text-sm text-muted-foreground">
          Theater &amp; IDN Live Plus — JKT48
        </p>
      </div>

      {/* Login notice */}
      {!isLoggedIn && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400">
          Login terlebih dahulu untuk membeli ticket.
        </div>
      )}

      {/* Buy error */}
      {buyError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400 flex items-start justify-between gap-3">
          <span>{buyError}</span>
          <button onClick={() => setBuyError(null)} className="shrink-0 text-red-500 hover:text-red-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex border-b border-border gap-5 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              filter === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.key !== "all" && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({shows.filter(s => s.status === t.key).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Fetch error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground text-sm">
          Tidak ada show untuk kategori ini.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(show => (
            <ShowCard
              key={show.slug}
              show={show}
              onBuy={handleBuy}
              buying={buying === show.show_id}
              isLoggedIn={isLoggedIn}
            />
          ))}
        </div>
      )}

      {/* QRIS Modal */}
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
