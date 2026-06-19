"use client"

import { useEffect, useState, useRef, useCallback } from "react"

// ─── API Constants ─────────────────────────────────────────
const API_BASE = "https://v5.jkt48connect.com/api/team48"
const API_KEY  = "JKTCONNECT"

// ─── Types ─────────────────────────────────────────────────

interface OwnedPm {
  idol_identifier: string
  idol_name:       string
  is_active:       boolean
  expires_at:      string
  days_remaining:  number
}

interface PmAttachment {
  file_path:    string
  content_type: string
  file_name?:   string
}

interface PmMessage {
  message_id:  string | number
  sender_type: "idol" | "fan" | string
  sender_name: string
  body:        string
  created_at:  string
  attachments: PmAttachment[]
}

interface PmMessagesData {
  idol_name:       string
  identifier:      string
  conversation_id: string
  page:            number
  fetched_at:      string
  data: {
    messages:   PmMessage[]
    total_page: number
    page:       number
  }
}

// ─── Helpers ───────────────────────────────────────────────

function getAccessToken(): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(/(?:^|;\s*)t48_access_token=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : null
}

async function fetchWithAuth(url: string): Promise<Response> {
  const token = getAccessToken()
  return fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta",
  })
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("id-ID", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
  })
}

function formatChatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return "Hari ini"
  if (days === 1) return "Kemarin"
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" })
}

function initials(name: string): string {
  return name.trim().split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
}

function isImageType(contentType: string, filePath: string): boolean {
  if (contentType?.startsWith("image/")) return true
  return /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(filePath || "")
}

function isVideoType(contentType: string, filePath: string): boolean {
  if (contentType?.startsWith("video/")) return true
  return /\.(mp4|mov|webm|ogg)(\?|$)/i.test(filePath || "")
}

// ─── Icons ─────────────────────────────────────────────────

function IconArrowLeft(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 5l-7 7 7 7" />
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
function IconSpinner(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.2" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}
function IconChevronLeft(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}
function IconChevronRight(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
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
function IconEmpty(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    </svg>
  )
}
function IconCalendar(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path strokeLinecap="round" d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}
function IconImage(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21" />
    </svg>
  )
}
function IconVideo(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.55-2.6A1 1 0 0121 8.37v7.26a1 1 0 01-1.45.9L15 14M4 8a2 2 0 012-2h9a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" />
    </svg>
  )
}
function IconShop(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  )
}

// ─── Lightbox ──────────────────────────────────────────────

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <img
        src={src}
        alt="Lampiran"
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        aria-label="Tutup"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

// ─── Attachment Bubble ──────────────────────────────────────

function AttachmentBubble({ att }: { att: PmAttachment }) {
  const [lightbox, setLightbox] = useState<string | null>(null)

  if (isImageType(att.content_type, att.file_path)) {
    return (
      <>
        <button
          type="button"
          className="mt-1.5 block overflow-hidden rounded-xl border border-white/10 hover:opacity-90 transition-opacity"
          onClick={() => setLightbox(att.file_path)}
        >
          <img
            src={att.file_path}
            alt={att.file_name || "Gambar"}
            referrerPolicy="no-referrer"
            className="max-h-52 max-w-[220px] object-cover"
            loading="lazy"
          />
        </button>
        {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
      </>
    )
  }

  if (isVideoType(att.content_type, att.file_path)) {
    return (
      <video
        src={att.file_path}
        controls
        className="mt-1.5 max-h-52 max-w-[220px] rounded-xl border border-white/10 object-cover"
      />
    )
  }

  return (
    <a
      href={att.file_path}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1.5 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-primary underline-offset-2 hover:underline"
    >
      <IconImage className="h-4 w-4 shrink-0" />
      {att.file_name || "Lampiran"}
    </a>
  )
}

// ─── Message Bubble ─────────────────────────────────────────

function MessageBubble({ msg, idolName }: { msg: PmMessage; idolName: string }) {
  const isIdol = msg.sender_type === "idol"

  return (
    <div className={`flex gap-2 ${isIdol ? "justify-start" : "justify-end"}`}>
      {/* Avatar idol — sisi kiri */}
      {isIdol && (
        <div className="flex-shrink-0 mt-auto">
          <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-[10px] font-bold text-primary">{initials(idolName)}</span>
          </div>
        </div>
      )}

      <div className={`flex max-w-[75%] flex-col ${isIdol ? "items-start" : "items-end"}`}>
        {/* Bubble */}
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
            isIdol
              ? "rounded-tl-sm bg-card border border-border text-foreground"
              : "rounded-tr-sm bg-primary text-primary-foreground"
          }`}
        >
          {msg.body && <p className="whitespace-pre-wrap break-words">{msg.body}</p>}

          {/* Attachments */}
          {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
            <div className="flex flex-col gap-1">
              {msg.attachments.map((att, i) => (
                <AttachmentBubble key={i} att={att} />
              ))}
            </div>
          )}
        </div>

        <span className="mt-1 text-[10px] text-muted-foreground tabular-nums">
          {formatTime(msg.created_at)}
        </span>
      </div>

      {/* Spacer fan — sisi kanan (no avatar) */}
      {!isIdol && <div className="w-7 flex-shrink-0" />}
    </div>
  )
}

// ─── Date Separator ────────────────────────────────────────

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

// ─── Chat View ──────────────────────────────────────────────

function ChatView({ idol, onBack }: { idol: OwnedPm; onBack: () => void }) {
  const [data, setData]         = useState<PmMessagesData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [page, setPage]         = useState(1)
  const [totalPage, setTotalPage] = useState(1)
  const bottomRef               = useRef<HTMLDivElement>(null)

  const fetchMessages = useCallback(async (p: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchWithAuth(
        `${API_BASE}/pm/messages/${encodeURIComponent(idol.idol_name)}?apikey=${API_KEY}&page=${p}`
      )
      const json = await res.json()
      if (!json.status) {
        setError(json.message || "Gagal memuat pesan.")
        return
      }
      setData(json)
      setTotalPage(json.data?.total_page || 1)
    } catch (_) {
      setError("Terjadi kesalahan jaringan.")
    } finally {
      setLoading(false)
    }
  }, [idol.idol_name])

  useEffect(() => {
    fetchMessages(page)
  }, [page, fetchMessages])

  // Scroll to bottom saat pesan pertama kali dimuat
  useEffect(() => {
    if (!loading && data && page === 1) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" })
    }
  }, [loading, data, page])

  // Group messages by date
  const groupedMessages = (() => {
    if (!data?.data?.messages) return []
    const msgs = [...data.data.messages]
    const groups: { date: string; messages: PmMessage[] }[] = []
    let currentDate = ""

    for (const msg of msgs) {
      const d = formatChatDate(msg.created_at)
      if (d !== currentDate) {
        currentDate = d
        groups.push({ date: d, messages: [] })
      }
      groups[groups.length - 1].messages.push(msg)
    }

    return groups
  })()

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden">
      {/* Chat Header */}
      <div className="flex items-center gap-3 border-b border-border bg-background/95 backdrop-blur px-4 py-3 shrink-0">
        <button
          onClick={onBack}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label="Kembali"
        >
          <IconArrowLeft className="h-5 w-5" />
        </button>

        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
          <span className="text-xs font-bold text-primary">{initials(idol.idol_name)}</span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{idol.idol_name}</p>
          <p className="text-[11px] text-muted-foreground">
            Akses hingga {formatDateShort(idol.expires_at)} · {idol.days_remaining}h lagi
          </p>
        </div>

        {/* Page navigator — di kanan header */}
        {totalPage > 1 && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Halaman sebelumnya"
            >
              <IconChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[48px] text-center text-xs font-medium tabular-nums text-muted-foreground">
              {page}/{totalPage}
            </span>
            <button
              disabled={page >= totalPage || loading}
              onClick={() => setPage((p) => Math.min(totalPage, p + 1))}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Halaman berikutnya"
            >
              <IconChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Chat Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {loading && (
          <div className="flex h-full items-center justify-center">
            <IconSpinner className="h-7 w-7 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && !loading && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <IconAlert className="h-7 w-7 text-red-500" />
            </div>
            <p className="text-sm text-muted-foreground max-w-[280px]">{error}</p>
            <button
              onClick={() => fetchMessages(page)}
              className="text-xs text-primary underline underline-offset-4 hover:text-primary/80"
            >
              Coba lagi
            </button>
          </div>
        )}

        {!loading && !error && groupedMessages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <IconEmpty className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Belum ada pesan di halaman ini.</p>
          </div>
        )}

        {!loading && !error && groupedMessages.map((group) => (
          <div key={group.date}>
            <DateSeparator label={group.date} />
            <div className="space-y-2">
              {group.messages.map((msg) => (
                <MessageBubble
                  key={msg.message_id}
                  msg={msg}
                  idolName={idol.idol_name}
                />
              ))}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Bottom info bar */}
      <div className="shrink-0 border-t border-border bg-muted/30 px-4 py-2.5 text-center text-[11px] text-muted-foreground">
        Ini adalah percakapan PM tersimpan. Chat bersifat read-only.
      </div>
    </div>
  )
}

// ─── Owned PM Card ──────────────────────────────────────────

function OwnedPmCard({ pm, onClick }: { pm: OwnedPm; onClick: () => void }) {
  const urgentExpiry = pm.days_remaining <= 3

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-4 text-left shadow-sm transition-all hover:shadow-md hover:border-primary/40 active:scale-[0.99]"
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 border-2 border-primary/20">
          <span className="text-sm font-bold text-primary">{initials(pm.idol_name)}</span>
        </div>
        {pm.is_active && (
          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-green-500" />
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{pm.idol_name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className={`flex items-center gap-1 text-[11px] font-medium ${
            urgentExpiry ? "text-red-500 dark:text-red-400" : "text-muted-foreground"
          }`}>
            <IconCalendar className="h-3 w-3" />
            {urgentExpiry
              ? `Berakhir ${pm.days_remaining}h lagi!`
              : `Aktif hingga ${formatDateShort(pm.expires_at)}`}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{pm.days_remaining} hari tersisa</p>
      </div>

      {/* CTA */}
      <div className="flex-shrink-0 flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5">
        <IconChat className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-primary">Baca PM</span>
      </div>
    </button>
  )
}

// ─── Skeleton ───────────────────────────────────────────────

function OwnedPmSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-4 animate-pulse">
      <div className="h-12 w-12 rounded-full bg-muted flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-2/5 rounded bg-muted" />
        <div className="h-2.5 w-3/5 rounded bg-muted" />
        <div className="h-2.5 w-1/4 rounded bg-muted" />
      </div>
      <div className="h-8 w-20 rounded-lg bg-muted" />
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────

export default function PmChatPage() {
  const [ownedList, setOwnedList]   = useState<OwnedPm[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [selectedIdol, setSelectedIdol] = useState<OwnedPm | null>(null)

  useEffect(() => {
    setIsLoggedIn(!!getAccessToken())
  }, [])

  const fetchOwned = useCallback(async () => {
    if (!getAccessToken()) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetchWithAuth(`${API_BASE}/pm/my?apikey=${API_KEY}`)
      const json = await res.json()
      if (json.status && Array.isArray(json.data)) {
        setOwnedList(json.data)
      } else {
        setError(json.message || "Gagal memuat daftar PM.")
      }
    } catch (_) {
      setError("Terjadi kesalahan jaringan.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isLoggedIn) fetchOwned()
  }, [isLoggedIn, fetchOwned])

  // ── Chat view terbuka ──
  if (selectedIdol) {
    return <ChatView idol={selectedIdol} onBack={() => setSelectedIdol(null)} />
  }

  // ── Daftar PM yang dimiliki ──
  const activeList   = ownedList.filter((p) => p.is_active)
  const expiredList  = ownedList.filter((p) => !p.is_active)

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-4 py-6 sm:py-8 space-y-5 sm:space-y-6">

      {/* Header */}
      <div className="space-y-1">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <IconChat className="h-3.5 w-3.5" />
          PM Saya
        </span>
        <h1 className="text-xl sm:text-2xl font-semibold">Private Message</h1>
        <p className="text-sm text-muted-foreground">
          Baca percakapan PM idol JKT48 yang sudah kamu beli aksesnya.
        </p>
      </div>

      {/* Not logged in */}
      {!isLoggedIn && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400 flex items-center gap-2.5">
          <IconAlert className="h-[17px] w-[17px] shrink-0" />
          Login terlebih dahulu untuk melihat PM yang kamu miliki.
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400 flex items-center gap-2.5">
          <IconAlert className="h-[17px] w-[17px] shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <OwnedPmSkeleton key={i} />)}
        </div>
      )}

      {/* Daftar PM aktif */}
      {!loading && isLoggedIn && (
        <>
          {activeList.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Akses Aktif · {activeList.length} idol
              </h2>
              <div className="space-y-2.5">
                {activeList.map((pm) => (
                  <OwnedPmCard
                    key={pm.idol_identifier}
                    pm={pm}
                    onClick={() => setSelectedIdol(pm)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Daftar PM kedaluwarsa */}
          {expiredList.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Sudah Berakhir
              </h2>
              <div className="space-y-2.5 opacity-60">
                {expiredList.map((pm) => (
                  <div
                    key={pm.idol_identifier}
                    className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-4"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted border-2 border-border flex-shrink-0">
                      <span className="text-sm font-bold text-muted-foreground">{initials(pm.idol_name)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-muted-foreground">{pm.idol_name}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Berakhir {formatDateShort(pm.expires_at)}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">Kedaluwarsa</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {ownedList.length === 0 && !loading && (
            <div className="py-20 flex flex-col items-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <IconEmpty className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <div>
                <p className="font-medium text-foreground">Belum punya akses PM</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Beli akses PM idol favoritmu untuk mulai membaca pesan mereka.
                </p>
              </div>
              <a
                href="/pm"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <IconShop className="h-4 w-4" />
                Beli Akses PM
              </a>
            </div>
          )}
        </>
      )}
    </div>
  )
}
