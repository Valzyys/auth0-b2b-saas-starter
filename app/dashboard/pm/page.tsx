"use client"

import { useEffect, useState, useRef, useCallback, useMemo } from "react"

// ─── API Constants ─────────────────────────────────────────
const API_BASE = "https://v5.jkt48connect.com/api/team48"
const API_KEY  = "JKTCONNECT"
const POLL_MS  = 4000

// ─── Types ─────────────────────────────────────────────────

interface PmMember {
  idol_id:           string
  identifier:        string
  name:              string
  given_name:        string
  family_name:       string
  profile_image:     string | null
  group:             string
  rank:              number
  previous_rank:     number
  rank_change:       number
  rank_status:       "up" | "down" | "same"
  messages_per_week: number
  tier:              string
  tier_label:        string
  is_owned:          boolean
}

interface PmPlan {
  plan_code:    string
  label:        string
  duration_days: number
  price:        number
}

interface ActivePmPayment {
  ref_id:          string
  idol_name:       string
  plan_label:      string
  amount:          number
  qris_image_url:  string | null
  expired_at:      string
}

interface PmOrder {
  ref_id:           string
  idol_identifier:  string
  idol_name:        string
  plan_code:        string
  duration_days:    number
  amount:           number
  qris_image_url:   string | null
  status:           string
  expired_at:       string
  paid_at:          string | null
  cancelled_at:     string | null
  created_at:       string
}

// ─── Helpers ───────────────────────────────────────────────

function formatRp(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", minimumFractionDigits: 0,
  }).format(amount)
}

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return "-"
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta",
  })
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "-"
  return new Date(dateStr).toLocaleString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
  }) + " WIB"
}

function getAccessToken(): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(/(?:^|;\s*)t48_access_token=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : null
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
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

function statusColor(status: string): string {
  switch (status) {
    case "paid":      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
    case "pending":   return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
    case "expired":   return "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
    case "cancelled": return "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
    default:          return "bg-gray-100 text-gray-500"
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "paid":      return "Lunas"
    case "pending":   return "Menunggu"
    case "expired":   return "Kedaluwarsa"
    case "cancelled": return "Dibatalkan"
    default:          return status
  }
}

function initials(name: string | null | undefined): string {
  return (name || "?").trim().charAt(0).toUpperCase()
}

// ─── Icons (all inline SVG, no emoji) ──────────────────────

function IconSearch(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="11" cy="11" r="7" strokeLinecap="round" />
      <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
    </svg>
  )
}
function IconChat(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
    </svg>
  )
}
function IconCrown(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 19h18M4 10l4 3 4-7 4 7 4-3-2 9H6l-2-9z" />
    </svg>
  )
}
function IconArrowUp(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  )
}
function IconArrowDown(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12l7 7 7-7" />
    </svg>
  )
}
function IconMinus(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}>
      <path strokeLinecap="round" d="M5 12h14" />
    </svg>
  )
}
function IconClose(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
function IconCheck(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}
function IconClock(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3.2 1.9" />
    </svg>
  )
}
function IconCopy(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1" />
    </svg>
  )
}
function IconSpinner(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.2" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}
function IconEmpty(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7l9-4 9 4-9 4-9-4zm0 0v10l9 4 9-4V7M3 7l9 4 9-4" />
    </svg>
  )
}
function IconHistory(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v5h5M12 7v5l4 2" />
    </svg>
  )
}
function IconMembers(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 19v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 17.5V19M16 19h4v-1.5a3.5 3.5 0 00-2.7-3.4M14.5 4.6a3 3 0 010 5.8M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7z" />
    </svg>
  )
}
function IconAlert(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.9L2.5 17a1.5 1.5 0 001.3 2.3h16.4a1.5 1.5 0 001.3-2.3L13.7 3.9a1.5 1.5 0 00-2.6 0z" />
    </svg>
  )
}

// ─── Rank delta badge ───────────────────────────────────────

function RankDelta({ status, change }: { status: PmMember["rank_status"]; change: number }) {
  if (status === "up") {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-green-600 dark:text-green-400">
        <IconArrowUp className="h-2.5 w-2.5" />{Math.abs(change)}
      </span>
    )
  }
  if (status === "down") {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-500 dark:text-red-400">
        <IconArrowDown className="h-2.5 w-2.5" />{Math.abs(change)}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-muted-foreground">
      <IconMinus className="h-2.5 w-2.5" />
    </span>
  )
}

// ─── Skeletons ───────────────────────────────────────────────

function MemberSkeleton() {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card animate-pulse">
      <div className="h-28 sm:h-40 bg-muted" />
      <div className="space-y-2 p-2.5 sm:p-3.5">
        <div className="h-3 w-3/4 rounded bg-muted" />
        <div className="h-2.5 w-2/5 rounded bg-muted" />
        <div className="h-7 w-full rounded bg-muted mt-1" />
      </div>
    </div>
  )
}

// ─── Member Card ─────────────────────────────────────────────
// Foto profil full-card di bagian atas (object-cover, kotak/rectangular),
// bukan avatar bundar — mengikuti pola ShowCard di halaman jadwal show.

function MemberCard({
  member,
  onSelect,
  busy,
}: {
  member: PmMember
  onSelect: (member: PmMember) => void
  busy:   boolean
}) {
  const [imgError, setImgError] = useState(false)

  return (
    <button
      type="button"
      onClick={() => onSelect(member)}
      disabled={busy}
      className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition-shadow hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {/* Foto — kotak penuh di atas card */}
      <div className="relative h-28 sm:h-40 w-full overflow-hidden bg-muted shrink-0">
        {!imgError && member.profile_image ? (
          <img
            src={member.profile_image}
            alt={member.name}
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="text-2xl sm:text-3xl font-semibold text-muted-foreground/40">
              {initials(member.given_name || member.name)}
            </span>
          </div>
        )}

        <span className="absolute top-1.5 left-1.5 sm:top-2.5 sm:left-2.5 rounded-full bg-black/70 px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-bold text-white tabular-nums">
          #{member.rank}
        </span>

        {member.is_owned && (
          <span className="absolute top-1.5 right-1.5 sm:top-2.5 sm:right-2.5 flex items-center gap-1 rounded-full bg-green-500 px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-semibold text-white">
            <IconCheck className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
            <span className="hidden sm:inline">Dimiliki</span>
          </span>
        )}
      </div>

      {/* Konten */}
      <div className="flex flex-1 min-w-0 flex-col gap-1.5 sm:gap-2 p-2.5 sm:p-3.5">
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-semibold leading-tight text-foreground truncate">
            {member.given_name || member.name}
          </p>
          <p className="text-[10.5px] sm:text-xs text-muted-foreground line-clamp-1">{member.name}</p>
        </div>

        <div className="flex items-center justify-between gap-1.5 sm:gap-2 min-w-0">
          <span className="min-w-0 truncate rounded-full border border-border bg-muted px-1.5 sm:px-2.5 py-0.5 text-[9px] sm:text-[10.5px] font-medium text-muted-foreground">
            {member.tier_label.replace(/^[^\w]+\s*/u, "")}
          </span>
          <RankDelta status={member.rank_status} change={member.rank_change} />
        </div>

        <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-muted-foreground">
          <IconChat className="h-3 w-3 shrink-0" />
          <span className="truncate">{member.messages_per_week.toLocaleString("id-ID")} pesan/minggu</span>
        </div>

        <div className="mt-auto pt-1.5 sm:pt-2 border-t border-border text-center text-[11px] sm:text-xs font-semibold text-primary">
          {member.is_owned ? "Perpanjang akses" : "Pilih paket"}
        </div>
      </div>
    </button>
  )
}

// ─── Plan Selection Modal ────────────────────────────────────

function PlanModal({
  member,
  plans,
  onClose,
  onConfirm,
  ordering,
  orderError,
}: {
  member:     PmMember
  plans:      PmPlan[]
  onClose:    () => void
  onConfirm:  (member: PmMember, planCode: string) => void
  ordering:   boolean
  orderError: string | null
}) {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(
    plans[1]?.plan_code ?? plans[0]?.plan_code ?? null
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={(e) => { if (e.target === e.currentTarget && !ordering) onClose() }}
    >
      <div className="w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-border bg-muted flex items-center justify-center">
              {member.profile_image
                ? <img
                    src={member.profile_image}
                    alt={member.name}
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                : <span className="text-sm font-semibold text-muted-foreground">{initials(member.name)}</span>}
            </span>
            <span>
              <span className="block text-sm font-semibold">PM {member.given_name || member.name}</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                {member.tier_label.replace(/^[^\w]+\s*/u, "")} · #{member.rank} minggu ini
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={ordering}
            aria-label="Tutup"
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <IconClose className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="px-5 py-5">
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pilih durasi akses
          </p>
          <div className="mb-4 flex flex-col gap-2">
            {plans.map((plan) => {
              const active = selectedPlan === plan.plan_code
              const perDay = Math.round(plan.price / plan.duration_days)
              return (
                <button
                  type="button"
                  key={plan.plan_code}
                  onClick={() => setSelectedPlan(plan.plan_code)}
                  disabled={ordering}
                  className={`flex items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                    active
                      ? "border-primary bg-primary/5"
                      : "border-border bg-muted hover:border-muted-foreground"
                  }`}
                >
                  <span
                    className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                      active ? "border-primary" : "border-muted-foreground"
                    }`}
                  >
                    {active && <span className="h-[9px] w-[9px] rounded-full bg-primary" />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-semibold">{plan.label}</span>
                    <span className="mt-0.5 text-[11px] text-muted-foreground">
                      {formatRp(perDay)} / hari
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums">
                    {formatRp(plan.price)}
                  </span>
                </button>
              )
            })}
          </div>

          {orderError && (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              <IconAlert className="mt-0.5 h-[15px] w-[15px] shrink-0" />
              <span>{orderError}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => selectedPlan && onConfirm(member, selectedPlan)}
            disabled={ordering || !selectedPlan}
            className="w-full rounded-md bg-primary py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {ordering
              ? <span className="flex items-center justify-center gap-2">
                  <IconSpinner className="h-4 w-4 animate-spin" />
                  Membuat order…
                </span>
              : `Bayar ${formatRp(plans.find(p => p.plan_code === selectedPlan)?.price ?? 0)}`}
          </button>
          <p className="mt-2.5 text-center text-[11.5px] text-muted-foreground">
            Pembayaran via QRIS. Akses aktif otomatis setelah dibayar.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── QRIS Payment Modal ────────────────────────────────────

function QrisModal({
  payment,
  onClose,
  onSuccess,
}: {
  payment:   ActivePmPayment
  onClose:   () => void
  onSuccess: () => void
}) {
  const [pollStatus, setPollStatus] = useState<"pending" | "paid" | "expired" | "cancelled">("pending")
  const [cancelling, setCancelling] = useState(false)
  const [copied, setCopied] = useState(false)
  const [secsLeft, setSecsLeft] = useState<number>(() => {
    if (payment.expired_at) {
      const diff = Math.floor((new Date(payment.expired_at).getTime() - Date.now()) / 1000)
      return Math.max(0, diff)
    }
    return 15 * 60
  })
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const mins = Math.floor(Math.max(0, secsLeft) / 60)
  const secs = Math.max(0, secsLeft) % 60

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  useEffect(() => {
    if (pollStatus !== "pending") return

    const poll = async () => {
      try {
        const res  = await fetchWithAuth(`${API_BASE}/pm/order/${payment.ref_id}/status?apikey=${API_KEY}`)
        const data = await res.json()
        if (!data.status) return

        const st = data.data?.status
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

  useEffect(() => {
    if (pollStatus !== "pending" || secsLeft <= 0) return
    const t = setInterval(() => setSecsLeft((p) => {
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
      await fetchWithAuth(`${API_BASE}/pm/order/${payment.ref_id}/cancel?apikey=${API_KEY}`, { method: "PUT" })
      stopPoll(); setPollStatus("cancelled")
    } catch (_) {} finally { setCancelling(false) }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(payment.ref_id)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={(e) => { if (e.target === e.currentTarget && pollStatus !== "pending") onClose() }}
    >
      <div className="w-full max-w-sm rounded-xl border border-border bg-background shadow-xl overflow-hidden">

        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Pembayaran PM</h2>
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
              {payment.idol_name} · {payment.plan_label}
            </p>
          </div>
          {pollStatus !== "pending" && (
            <button onClick={onClose} className="ml-3 text-muted-foreground hover:text-foreground" aria-label="Tutup">
              <IconClose className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="px-5 py-5 space-y-4">

          {pollStatus === "paid" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <IconCheck className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <div className="text-center">
                <p className="font-semibold">Akses PM aktif</p>
                <p className="mt-1 text-sm text-muted-foreground">Lihat detail di tab Riwayat.</p>
              </div>
              <button onClick={onClose} className="mt-2 w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                Tutup
              </button>
            </div>
          )}

          {pollStatus === "expired" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                <IconClock className="h-8 w-8 text-gray-500" />
              </div>
              <div className="text-center">
                <p className="font-semibold">Waktu habis</p>
                <p className="mt-1 text-sm text-muted-foreground">QRIS sudah kedaluwarsa. Buat order baru untuk melanjutkan.</p>
              </div>
              <button onClick={onClose} className="mt-2 w-full rounded-md border border-input py-2.5 text-sm font-medium hover:bg-accent">
                Tutup
              </button>
            </div>
          )}

          {pollStatus === "cancelled" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <IconClose className="h-8 w-8 text-red-500" />
              </div>
              <div className="text-center">
                <p className="font-semibold">Order dibatalkan</p>
                <p className="mt-1 text-sm text-muted-foreground">Buat order baru untuk melanjutkan.</p>
              </div>
              <button onClick={onClose} className="mt-2 w-full rounded-md border border-input py-2.5 text-sm font-medium hover:bg-accent">
                Tutup
              </button>
            </div>
          )}

          {pollStatus === "pending" && (
            <>
              <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-2.5">
                <span className="text-sm text-muted-foreground">Total bayar</span>
                <span className="text-lg font-bold">{formatRp(payment.amount)}</span>
              </div>

              <div className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
                secsLeft < 120
                  ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400"
                  : "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400"
              }`}>
                <IconClock className="h-4 w-4 shrink-0" />
                Berakhir dalam {mins}m {String(secs).padStart(2, "0")}s
              </div>

              <div className="flex flex-col items-center gap-3">
                {payment.qris_image_url ? (
                  <img
                    src={payment.qris_image_url}
                    alt="QR Pembayaran"
                    referrerPolicy="no-referrer"
                    className="h-52 w-52 rounded-lg border border-border object-contain bg-white"
                  />
                ) : (
                  <div className="flex h-52 w-52 items-center justify-center rounded-lg border border-border bg-muted">
                    <IconSpinner className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                )}
                <p className="text-center text-xs text-muted-foreground">
                  Scan dengan e-wallet atau mobile banking manapun
                </p>
              </div>

              <button
                onClick={handleCopy}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <IconCopy className="h-3.5 w-3.5" />
                {copied ? "Ref ID tersalin" : "Salin Ref ID"}
              </button>

              <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium">Ref ID:</span>{" "}
                <span className="font-mono break-all">{payment.ref_id}</span>
              </div>

              <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-flex h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
                Menunggu konfirmasi pembayaran…
              </div>

              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="w-full rounded-md py-2 text-xs font-medium text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
              >
                {cancelling ? "Membatalkan…" : "Batalkan order"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Order History Row ──────────────────────────────────────

function OrderRow({
  order,
  onResume,
  onCancel,
  resuming,
  cancelling,
}: {
  order:      PmOrder
  onResume:   (order: PmOrder) => void
  onCancel:   (order: PmOrder) => void
  resuming:   boolean
  cancelling: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{order.ref_id}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(order.status)}`}>
              {statusLabel(order.status)}
            </span>
          </div>
          <p className="text-sm font-medium">{order.idol_name}</p>
          <p className="text-xs text-muted-foreground">
            {order.duration_days} hari akses · dibuat {formatDateShort(order.created_at)}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums">{formatRp(order.amount)}</p>
          {order.status === "paid" && order.paid_at && (
            <p className="mt-0.5 text-xs text-green-600 dark:text-green-400">
              Dibayar {formatDateShort(order.paid_at)}
            </p>
          )}
          {order.status === "pending" && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Expired {formatDateTime(order.expired_at)}
            </p>
          )}
        </div>
      </div>

      {order.status === "pending" && (
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => onResume(order)}
            disabled={resuming || cancelling}
            className="flex-1 rounded-md bg-primary py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resuming ? "Memuat…" : "Lanjutkan bayar"}
          </button>
          <button
            onClick={() => onCancel(order)}
            disabled={resuming || cancelling}
            className="rounded-md border border-input px-3.5 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelling ? "Membatalkan…" : "Batalkan"}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────

export default function PmPurchasePage() {
  const [members, setMembers]       = useState<PmMember[]>([])
  const [plans, setPlans]           = useState<PmPlan[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [search, setSearch]         = useState("")
  const [tierFilter, setTierFilter] = useState("all")
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [tab, setTab]               = useState<"members" | "history">("members")

  const [selectedMember, setSelectedMember] = useState<PmMember | null>(null)
  const [ordering, setOrdering]     = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)
  const [activePayment, setActivePayment] = useState<ActivePmPayment | null>(null)

  const [history, setHistory]       = useState<PmOrder[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [resumingRef, setResumingRef] = useState<string | null>(null)
  const [cancellingRef, setCancellingRef] = useState<string | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)

  useEffect(() => {
    setIsLoggedIn(!!getAccessToken())
  }, [])

  const fetchRanks = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/pm/ranks?apikey=${API_KEY}`)
      const data = await res.json()
      if (data.status && Array.isArray(data.data)) {
        setMembers(data.data)
      } else {
        setError("Gagal memuat daftar member.")
      }
    } catch (_) {
      setError("Terjadi kesalahan jaringan.")
    }
  }, [])

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/pm/plans?apikey=${API_KEY}`)
      const data = await res.json()
      if (data.status && Array.isArray(data.data)) setPlans(data.data)
    } catch (_) {}
  }, [])

  useEffect(() => {
    Promise.all([fetchRanks(), fetchPlans()]).finally(() => setLoading(false))
  }, [fetchRanks, fetchPlans])

  const fetchHistory = useCallback(async () => {
    if (!getAccessToken()) return
    setLoadingHistory(true)
    setHistoryError(null)
    try {
      const res = await fetchWithAuth(`${API_BASE}/pm/orders/my?apikey=${API_KEY}&limit=50`)
      const data = await res.json()
      if (data.status && Array.isArray(data.data)) {
        setHistory(data.data)
      } else {
        setHistoryError("Gagal memuat riwayat order.")
      }
    } catch (_) {
      setHistoryError("Terjadi kesalahan jaringan.")
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  useEffect(() => {
    if (isLoggedIn && tab === "history") fetchHistory()
  }, [isLoggedIn, tab, fetchHistory])

  const filteredMembers = useMemo(() => {
    let list = members
    if (tierFilter !== "all") list = list.filter((m) => m.tier === tierFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((m) =>
        m.name.toLowerCase().includes(q) ||
        (m.given_name || "").toLowerCase().includes(q) ||
        (m.identifier || "").toLowerCase().includes(q)
      )
    }
    return list
  }, [members, tierFilter, search])

  const tierTabs: { key: string; label: string }[] = [
    { key: "all",          label: "Semua" },
    { key: "super_aktif",  label: "Super Aktif" },
    { key: "aktif",        label: "Aktif" },
    { key: "cukup_aktif",  label: "Cukup Aktif" },
    { key: "jarang_chat",  label: "Jarang Chat" },
    { key: "tidak_aktif",  label: "Tidak Aktif" },
  ]

  const openPlanModal = (member: PmMember) => {
    if (!isLoggedIn) return
    setOrderError(null)
    setSelectedMember(member)
  }

  const handleConfirmOrder = async (member: PmMember, planCode: string) => {
    setOrdering(true)
    setOrderError(null)
    try {
      const res = await fetchWithAuth(`${API_BASE}/pm/order?apikey=${API_KEY}`, {
        method: "POST",
        body: JSON.stringify({ idol_name: member.name, plan_code: planCode }),
      })
      const data = await res.json()

      if (!data.status) {
        setOrderError(data.message || "Gagal membuat order. Coba lagi.")
        return
      }

      const plan = plans.find((p) => p.plan_code === (data.data.plan_code || planCode))
      setActivePayment({
        ref_id: data.data.ref_id,
        idol_name: data.data.idol_name,
        plan_label: data.data.plan_label || plan?.label || "",
        amount: data.data.amount,
        qris_image_url: data.data.qris_image_url,
        expired_at: data.data.expired_at,
      })
      setSelectedMember(null)
    } catch (_) {
      setOrderError("Terjadi kesalahan jaringan. Coba lagi.")
    } finally {
      setOrdering(false)
    }
  }

  const handleResumeFromHistory = useCallback(async (order: PmOrder) => {
    setResumingRef(order.ref_id)
    setHistoryError(null)
    try {
      const res = await fetchWithAuth(`${API_BASE}/pm/order/${order.ref_id}/status?apikey=${API_KEY}`)
      const data = await res.json()

      if (data.data?.status === "paid") {
        await fetchHistory()
        return
      }

      if (order.status === "pending") {
        const plan = plans.find((p) => p.plan_code === order.plan_code)
        setActivePayment({
          ref_id: order.ref_id,
          idol_name: order.idol_name,
          plan_label: plan?.label || `${order.duration_days} hari`,
          amount: order.amount,
          qris_image_url: order.qris_image_url,
          expired_at: order.expired_at,
        })
      } else {
        await fetchHistory()
      }
    } catch (_) {
      setHistoryError("Gagal memuat data pembayaran.")
    } finally {
      setResumingRef(null)
    }
  }, [fetchHistory, plans])

  const handleCancelOrder = useCallback(async (order: PmOrder) => {
    setCancellingRef(order.ref_id)
    setHistoryError(null)
    try {
      const res = await fetchWithAuth(`${API_BASE}/pm/order/${order.ref_id}/cancel?apikey=${API_KEY}`, { method: "PUT" })
      const data = await res.json()
      if (!data.status) {
        setHistoryError(data.message || "Gagal membatalkan order.")
      }
      await fetchHistory()
    } catch (_) {
      setHistoryError("Terjadi kesalahan jaringan.")
    } finally {
      setCancellingRef(null)
    }
  }, [fetchHistory])

  const handlePaymentSuccess = useCallback(() => {
    setActivePayment(null)
    fetchRanks()
    fetchHistory()
    setTab("history")
  }, [fetchRanks, fetchHistory])

  const pendingCount = history.filter((o) => o.status === "pending").length

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 py-6 sm:py-8 space-y-5 sm:space-y-6 overflow-x-hidden">

      {/* Header */}
      <div className="space-y-1">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <IconCrown className="h-3.5 w-3.5" />
          Private Message
        </span>
        <h1 className="text-xl sm:text-2xl font-semibold">Beli akses PM member JKT48</h1>
        <p className="text-sm text-muted-foreground max-w-xl">
          Aktivitas chat mingguan menentukan urutan di bawah. Pilih member, pilih durasi, bayar via QRIS.
        </p>
      </div>

      {/* Login notice */}
      {!isLoggedIn && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400 flex items-center gap-2.5">
          <IconAlert className="h-[17px] w-[17px] shrink-0" />
          Login terlebih dahulu untuk membeli akses PM.
        </div>
      )}

      {/* Main tabs: Members / History */}
      <div className="flex border-b border-border gap-6">
        <button
          onClick={() => setTab("members")}
          className={`flex items-center gap-1.5 pb-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === "members"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <IconMembers className="h-4 w-4" />
          Member
        </button>
        <button
          onClick={() => { setTab("history"); if (isLoggedIn && history.length === 0) fetchHistory() }}
          className={`flex items-center gap-1.5 pb-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === "history"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <IconHistory className="h-4 w-4" />
          Riwayat
          {pendingCount > 0 && (
            <span className="rounded-full bg-yellow-500 px-1.5 py-0.5 text-xs font-semibold leading-none text-white">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Tab: Members ── */}
      {tab === "members" && (
        <>
          <div className="space-y-3.5 -mt-2">
            <label className="flex w-full sm:max-w-xs items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
              <IconSearch className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama member…"
                className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </label>

            <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 sm:mx-0 sm:px-0">
              {tierTabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTierFilter(t.key)}
                  className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                    tierFilter === t.key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          {loading ? (
            <div className="grid gap-2.5 sm:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <MemberSkeleton key={i} />)}
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground text-sm space-y-2">
              <IconEmpty className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p>Tidak ada member yang cocok dengan pencarian.</p>
            </div>
          ) : (
            <div className="grid gap-2.5 sm:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {filteredMembers.map((member) => (
                <MemberCard
                  key={member.idol_id}
                  member={member}
                  onSelect={openPlanModal}
                  busy={false}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Tab: History ── */}
      {tab === "history" && (
        <>
          {!isLoggedIn ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              Login untuk melihat riwayat pembelian PM kamu.
            </div>
          ) : (
            <>
              {historyError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                  {historyError}
                </div>
              )}

              {loadingHistory ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-24 rounded-xl border border-border bg-muted animate-pulse" />
                  ))}
                </div>
              ) : history.length === 0 ? (
                <div className="py-16 text-center space-y-2">
                  <IconHistory className="mx-auto h-10 w-10 text-muted-foreground/30" />
                  <p className="text-muted-foreground text-sm">Belum ada riwayat pembelian PM.</p>
                  <button
                    onClick={() => setTab("members")}
                    className="text-sm text-primary underline underline-offset-4 hover:text-primary/80"
                  >
                    Lihat daftar member →
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((order) => (
                    <OrderRow
                      key={order.ref_id}
                      order={order}
                      onResume={handleResumeFromHistory}
                      onCancel={handleCancelOrder}
                      resuming={resumingRef === order.ref_id}
                      cancelling={cancellingRef === order.ref_id}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Plan Modal */}
      {selectedMember && plans.length > 0 && (
        <PlanModal
          member={selectedMember}
          plans={plans}
          onClose={() => { if (!ordering) { setSelectedMember(null); setOrderError(null) } }}
          onConfirm={handleConfirmOrder}
          ordering={ordering}
          orderError={orderError}
        />
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
