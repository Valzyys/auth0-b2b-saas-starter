"use client"

import { useEffect, useState, useRef, useCallback } from "react"

// ─── API Constants ─────────────────────────────────────────
const API_BASE = "https://v5.jkt48connect.com/api/team48"
const API_KEY  = "JKTCONNECT"
const IMAGE_PROXY_BASE = "https://pay.jkt48connect.com/api/proxy-image"

// ─── Types — disesuaikan dengan struktur API nyata ──────────

interface OwnedPm {
  idol_identifier: string
  idol_name:       string
  is_active:       boolean
  expires_at:      string
  days_remaining:  number
}

interface PmAttachment {
  file_path:  string
  file_type:  string   // ← API pakai file_type, bukan content_type
  file_name:  string | null
  width:      number | null
  height:     number | null
}

interface PollOption {
  option_id:   string
  option_text: string
  vote_count:  number
  voters:      { user_id: string; name: string; profile_image: string | null }[]
}

interface PmPoll {
  polling_id:             string
  question:               string
  allow_multiple_answers: boolean
  options:                PollOption[]
  total_votes:            number
  my_votes:               string[]
  created_by:             { user_id: string; name: string }
}

interface PmMessage {
  id:          string          // ← field-nya "id", bukan "message_id"
  type:        string
  body:        string
  created_at:  string
  updated_at:  string
  attachments: PmAttachment[]
  poll:        PmPoll | null
}

// Struktur response GET /pm/messages/:idol_name
// json.data.messages — bukan json.data langsung
interface PmApiResponse {
  status: boolean
  message?: string

  idol_name: string
  identifier: string
  conversation_id: string
  page: number
  fetched_at: string

  data: {
    success: boolean
    conversation_id: string
    page: number
    pageSize: number
    count: number
    has_more: boolean
    messages: PmMessage[]
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

// Strip invisible unicode yang dikirim PM API (zero-width chars dll)
function cleanBody(text: string): string {
  if (!text) return ""
  return text
    .replace(/[\u200B-\u200D\uFEFF\u2060\u180E\u00AD]/g, "") // zero-width
    .replace(/[\u{E0000}-\u{E007F}]/gu, "")                   // tag chars
    .trim()
}

// Bungkus URL gambar lewat image proxy, biar aman dari hotlink block / referrer issue
function proxyImageUrl(url: string): string {
  if (!url) return url
  // Jangan double-proxy kalau sudah lewat proxy
  if (url.includes("/api/proxy-image")) return url
  return `${IMAGE_PROXY_BASE}?url=${encodeURIComponent(url)}`
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
  return (name || "?").trim().split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
}

// Gunakan file_type (bukan content_type) sesuai API
function isImageType(fileType: string | null, filePath: string): boolean {
  if (fileType?.startsWith("image/")) return true
  return /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(filePath || "")
}

function isVideoType(fileType: string | null, filePath: string): boolean {
  if (fileType?.startsWith("video/")) return true
  return /\.(mp4|mov|webm|ogg)(\?|$)/i.test(filePath || "")
}

function isAudioType(fileType: string | null, filePath: string): boolean {
  if (fileType?.startsWith("audio/")) return true
  return /\.(mp3|m4a|ogg|wav|aac|flac)(\?|$)/i.test(filePath || "")
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
function IconShop(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  )
}
function IconVolume(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12-3c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z" />
    </svg>
  )
}
function IconBarChart(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 20V10M12 20V4M6 20v-6" />
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
        src={proxyImageUrl(src)}
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

// ─── Poll Bubble ────────────────────────────────────────────

function PollBubble({ poll }: { poll: PmPoll }) {
  const maxVotes = Math.max(...poll.options.map(o => o.vote_count), 1)

  return (
    <div className="mt-1.5 w-full max-w-[260px] rounded-xl border border-border bg-background/80 p-3 text-left">
      <div className="flex items-center gap-1.5 mb-2.5">
        <IconBarChart className="h-3.5 w-3.5 text-primary shrink-0" />
        <p className="text-xs font-semibold text-foreground leading-snug">{poll.question}</p>
      </div>
      <div className="space-y-2">
        {poll.options.map((opt) => {
          const pct = poll.total_votes > 0
            ? Math.round((opt.vote_count / poll.total_votes) * 100)
            : 0
          const barWidth = poll.total_votes > 0
            ? Math.round((opt.vote_count / maxVotes) * 100)
            : 0
          return (
            <div key={opt.option_id} className="space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-foreground truncate">{opt.option_text}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{pct}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-2.5 text-[10px] text-muted-foreground">
        {poll.total_votes} suara · {poll.allow_multiple_answers ? "Multi pilih" : "Satu pilih"}
      </p>
    </div>
  )
}

// ─── Attachment Bubble ──────────────────────────────────────

function AttachmentBubble({ att }: { att: PmAttachment }) {
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [imgError, setImgError] = useState(false)

  // Gunakan file_type (field yang benar dari API)
  if (isImageType(att.file_type, att.file_path) && !imgError) {
    return (
      <>
        <button
          type="button"
          className="mt-1 block overflow-hidden rounded-xl border border-white/10 hover:opacity-90 transition-opacity"
          onClick={() => setLightbox(att.file_path)}
        >
          <img
            src={proxyImageUrl(att.file_path)}
            alt="Gambar"
            referrerPolicy="no-referrer"
            className="max-h-56 max-w-[240px] rounded-xl object-cover block"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        </button>
        {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
      </>
    )
  }

  if (isVideoType(att.file_type, att.file_path)) {
    return (
      <video
        src={att.file_path}
        controls
        className="mt-1 max-h-56 max-w-[240px] rounded-xl border border-border object-cover"
      />
    )
  }

  if (isAudioType(att.file_type, att.file_path)) {
    return (
      <div className="mt-1 flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2.5 max-w-[240px]">
        <IconVolume className="h-4 w-4 shrink-0 text-primary" />
        <audio
          src={att.file_path}
          controls
          className="h-7 w-full min-w-0"
          style={{ accentColor: "hsl(var(--primary))" }}
        />
      </div>
    )
  }

  // Fallback: link download
  return (
    <a
      href={att.file_path}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-primary hover:underline max-w-[240px]"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
      </svg>
      {att.file_name || "Lampiran"}
    </a>
  )
}

// ─── Message Bubble ─────────────────────────────────────────
// Semua pesan dari API dianggap dari idol (tidak ada sender_type di struktur nyata).
// body mengandung invisible chars — wajib strip dulu.

function MessageBubble({ msg, idolName }: { msg: PmMessage; idolName: string }) {
  const body = cleanBody(msg.body)
  const hasAttachments = Array.isArray(msg.attachments) && msg.attachments.length > 0
  const hasPoll = !!msg.poll
  const hasBody = body.length > 0

  if (!hasBody && !hasAttachments && !hasPoll) return null

  return (
    <div className="flex gap-2 justify-start">
      {/* Avatar idol */}
      <div className="flex-shrink-0 self-end mb-1">
        <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center">
          <span className="text-[10px] font-bold text-primary">{initials(idolName)}</span>
        </div>
      </div>

      <div className="flex max-w-[78%] flex-col items-start">
        {/* Bubble teks */}
        {hasBody && (
          <div className="rounded-2xl rounded-tl-sm border border-border bg-card px-3.5 py-2.5 text-sm leading-relaxed text-foreground">
            <p className="whitespace-pre-wrap break-words">{body}</p>
          </div>
        )}

        {/* Attachment(s) */}
        {hasAttachments && msg.attachments.map((att, i) => (
          <AttachmentBubble key={i} att={att} />
        ))}

        {/* Poll */}
        {hasPoll && msg.poll && <PollBubble poll={msg.poll} />}

        {/* Timestamp */}
        <span className="mt-1 text-[10px] text-muted-foreground tabular-nums">
          {formatTime(msg.updated_at || msg.created_at)}
        </span>
      </div>
    </div>
  )
}

// ─── Date Separator ────────────────────────────────────────

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-border" />
      <span className="rounded-full border border-border bg-muted px-3 py-0.5 text-[10.5px] font-medium text-muted-foreground">
        {label}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

// ─── Chat View ──────────────────────────────────────────────

function ChatView({ idol, onBack }: { idol: OwnedPm; onBack: () => void }) {
  const [messages, setMessages]     = useState<PmMessage[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [page, setPage]             = useState(1)
  const [hasMore, setHasMore]       = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [pageSize, setPageSize]     = useState(25)
  const bottomRef                   = useRef<HTMLDivElement>(null)

  const totalPage = Math.max(1, Math.ceil(totalCount / pageSize))

  const fetchMessages = useCallback(async (p: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchWithAuth(
        `${API_BASE}/pm/messages/${encodeURIComponent(idol.idol_name)}?apikey=${API_KEY}&page=${p}`
      )
      const json: PmApiResponse = await res.json()

      if (!json.status) {
        setError(json.message ?? "Gagal memuat pesan.")
        return
      }

      // Ambil dari json.data.messages (bukan json.data langsung)
      const rawMsgs = json.data?.messages ?? []

      // API return terbaru di index 0 — reverse agar urutan kronologis (lama di atas)
      const sorted = [...rawMsgs].reverse()

      setMessages(sorted)
      setHasMore(json.data?.has_more ?? false)
      setTotalCount(json.data?.count ?? rawMsgs.length)
      setPageSize(json.data?.pageSize ?? 25)
    } catch (_) {
      setError("Terjadi kesalahan jaringan.")
    } finally {
      setLoading(false)
    }
  }, [idol.idol_name])

  useEffect(() => {
    fetchMessages(page)
  }, [page, fetchMessages])

  // Scroll ke bawah setiap kali messages baru dimuat
  useEffect(() => {
    if (!loading && messages.length > 0) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80)
    }
  }, [loading, messages])

  // Group pesan berdasarkan tanggal (gunakan updated_at sesuai API)
  const grouped = (() => {
    const groups: { date: string; msgs: PmMessage[] }[] = []
    let cur = ""
    for (const msg of messages) {
      const d = formatChatDate(msg.updated_at || msg.created_at)
      if (d !== cur) { cur = d; groups.push({ date: d, msgs: [] }) }
      groups[groups.length - 1].msgs.push(msg)
    }
    return groups
  })()

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 border-b border-border bg-background/95 backdrop-blur px-4 py-3 shrink-0">
        <button
          onClick={onBack}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label="Kembali"
        >
          <IconArrowLeft className="h-5 w-5" />
        </button>

        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 border-2 border-primary/20">
          <span className="text-xs font-bold text-primary">{initials(idol.idol_name)}</span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{idol.idol_name}</p>
          <p className="text-[11px] text-muted-foreground">
            Aktif hingga {formatDateShort(idol.expires_at)} · {idol.days_remaining}h lagi
          </p>
        </div>

        {/* Pagination di header */}
        {totalPage > 1 && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              disabled={page <= 1 || loading}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Halaman sebelumnya"
            >
              <IconChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[52px] text-center text-xs font-medium tabular-nums text-muted-foreground">
              {page}/{totalPage}
            </span>
            <button
              disabled={page >= totalPage || loading}
              onClick={() => setPage(p => Math.min(totalPage, p + 1))}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Halaman berikutnya"
            >
              <IconChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* ── Chat Body ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4">

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

        {!loading && !error && messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <IconEmpty className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Belum ada pesan di halaman ini.</p>
          </div>
        )}

        {!loading && !error && grouped.map((g) => (
          <div key={g.date}>
            <DateSeparator label={g.date} />
            <div className="space-y-2.5">
              {g.msgs.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} idolName={idol.idol_name} />
              ))}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* ── Bottom bar ── */}
      <div className="shrink-0 border-t border-border bg-muted/30 px-4 py-2 text-center text-[11px] text-muted-foreground">
        Percakapan PM tersimpan · read-only
        {totalCount > 0 && <span className="ml-2 tabular-nums">· {totalCount} pesan</span>}
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
      <div className="relative flex-shrink-0">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 border-2 border-primary/20">
          <span className="text-sm font-bold text-primary">{initials(pm.idol_name)}</span>
        </div>
        {pm.is_active && (
          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-green-500" />
        )}
      </div>

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

      <div className="flex-shrink-0 flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5">
        <IconChat className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-primary">Baca PM</span>
      </div>
    </button>
  )
}

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
  const [ownedList, setOwnedList]       = useState<OwnedPm[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [isLoggedIn, setIsLoggedIn]     = useState(false)
  const [selectedIdol, setSelectedIdol] = useState<OwnedPm | null>(null)

  useEffect(() => { setIsLoggedIn(!!getAccessToken()) }, [])

  const fetchOwned = useCallback(async () => {
    if (!getAccessToken()) { setLoading(false); return }
    setLoading(true); setError(null)
    try {
      const res  = await fetchWithAuth(`${API_BASE}/pm/my?apikey=${API_KEY}`)
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

  useEffect(() => { if (isLoggedIn) fetchOwned() }, [isLoggedIn, fetchOwned])

  if (selectedIdol) {
    return <ChatView idol={selectedIdol} onBack={() => setSelectedIdol(null)} />
  }

  const activeList  = ownedList.filter(p => p.is_active)
  const expiredList = ownedList.filter(p => !p.is_active)

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-4 py-6 sm:py-8 space-y-5 sm:space-y-6">
      <div className="space-y-1">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <IconChat className="h-3.5 w-3.5" />PM Saya
        </span>
        <h1 className="text-xl sm:text-2xl font-semibold">Private Message</h1>
        <p className="text-sm text-muted-foreground">
          Baca percakapan PM idol JKT48 yang sudah kamu beli aksesnya.
        </p>
      </div>

      {!isLoggedIn && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400 flex items-center gap-2.5">
          <IconAlert className="h-[17px] w-[17px] shrink-0" />
          Login terlebih dahulu untuk melihat PM yang kamu miliki.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400 flex items-center gap-2.5">
          <IconAlert className="h-[17px] w-[17px] shrink-0" />{error}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <OwnedPmSkeleton key={i} />)}
        </div>
      )}

      {!loading && isLoggedIn && (
        <>
          {activeList.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Akses Aktif · {activeList.length} idol
              </h2>
              <div className="space-y-2.5">
                {activeList.map(pm => (
                  <OwnedPmCard key={pm.idol_identifier} pm={pm} onClick={() => setSelectedIdol(pm)} />
                ))}
              </div>
            </section>
          )}

          {expiredList.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Sudah Berakhir
              </h2>
              <div className="space-y-2.5 opacity-60">
                {expiredList.map(pm => (
                  <div key={pm.idol_identifier} className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted border-2 border-border flex-shrink-0">
                      <span className="text-sm font-bold text-muted-foreground">{initials(pm.idol_name)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-muted-foreground">{pm.idol_name}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">Berakhir {formatDateShort(pm.expires_at)}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">Kedaluwarsa</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {ownedList.length === 0 && (
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
                href="/dashboard/pm"
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
