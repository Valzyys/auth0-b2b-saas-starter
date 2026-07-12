"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useParams } from "next/navigation"
import { createClient } from "@supabase/supabase-js"

// ─── Constants ───────────────────────────────────────────────
const LIVE_API = "https://v5.jkt48connect.com/api/jkt48/live?apikey=JKTCONNECT"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mzxfuaoihgzxvokwarao.supabase.co"
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16eGZ1YW9paGd6eHZva3dhcmFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDg0NjIsImV4cCI6MjA4OTk4NDQ2Mn0.OFYCkBFXCSfLn-wG94OHHKL5CX8T_BLrbDGPiBdPIog"
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Types ───────────────────────────────────────────────────
interface StreamingUrl {
  label:   string
  quality: number
  url:     string
}

interface LiveShow {
  name:               string
  img:                string
  img_alt:            string
  url_key:            string
  slug:               string
  room_id:            number
  is_graduate:        boolean
  is_group:           boolean
  chat_room_id:       string
  started_at:         string
  type:               string
  identifier:         string
  showId:             string | null
  streaming_url_list: StreamingUrl[]
}

interface ChatMessage {
  id:          string
  userName:    string
  userAvatar?: string
  colorCode?:  string
  levelTier?:  number
  message:     string
  timestamp:   number
}

// ─── Helpers ────────────────────────────────────────────────
function generateMsgId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function makeUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function formatHHMM(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

function generateViewerId(): string {
  if (typeof window === "undefined") return crypto.randomUUID()
  const key = "t48_viewer_id"
  let id = localStorage.getItem(key)
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id) }
  return id
}

function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase() || "U"
}

function formatStartedAt(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString("id-ID", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
    }) + " WIB"
  } catch { return "" }
}

// ─── useViewerCount ───────────────────────────────────────────
function useViewerCount(roomKey: string | null) {
  const [viewerCount, setViewerCount] = useState(0)

  useEffect(() => {
    if (!roomKey) return
    const viewerId  = generateViewerId()
    const channelId = `t48-presence-${roomKey}`
    const channel   = supabase.channel(channelId, {
      config: { presence: { key: viewerId } },
    })
    channel
      .on("presence", { event: "sync" },  () => setViewerCount(Object.keys(channel.presenceState()).length))
      .on("presence", { event: "join" },  () => setViewerCount(Object.keys(channel.presenceState()).length))
      .on("presence", { event: "leave" }, () => setViewerCount(Object.keys(channel.presenceState()).length))
      .subscribe(async status => {
        if (status === "SUBSCRIBED") {
          await channel.track({ viewer_id: viewerId, joined_at: new Date().toISOString() })
        }
      })
    return () => { channel.untrack(); supabase.removeChannel(channel) }
  }, [roomKey])

  return viewerCount
}

// ─── useIdnChatReadOnly ─────────────────────────────────────────
// Connects directly to wss://chat.idn.app/ (IRC-like protocol) as a
// silent observer: joins the room, receives CHAT events, never sends.
function useIdnChatReadOnly(chatRoomId: string | null) {
  const [messages,  setMessages]  = useState<ChatMessage[]>([])
  const [connected, setConnected] = useState(false)
  const [joined,    setJoined]    = useState(false)
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "reconnecting" | "error">("idle")

  const wsRef            = useRef<WebSocket | null>(null)
  const mountedRef        = useRef(true)
  const reconnectTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chatRoomIdRef     = useRef<string | null>(chatRoomId)
  const nickRef           = useRef<string>("")

  const pushMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => {
      const next = [...prev, msg]
      return next.length > 150 ? next.slice(next.length - 150) : next
    })
  }, [])

  const createSocket = useCallback((roomId: string) => {
    if (wsRef.current) {
      try { wsRef.current.close(1000, "reconnect") } catch {}
      wsRef.current = null
    }
    setStatus("connecting")
    setConnected(false)
    setJoined(false)

    const guestId = Array.from({ length: 6 }, () =>
      "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]
    ).join("")
    const nick = `idn-${guestId}-web`
    nickRef.current = nick
    const uuid = makeUuid()

    const socket = new WebSocket("wss://chat.idn.app/")
    wsRef.current = socket

    socket.onopen = () => {
      if (!mountedRef.current) return
      socket.send("CAP LS 302")
      socket.send(`NICK ${nick}`)
      socket.send(`USER ${uuid} 0 * null`)
      socket.send(
        "CAP REQ :account-notify account-tag away-notify batch cap-notify " +
        "chghost echo-message extended-join invite-notify labeled-response " +
        "message-tags multi-prefix server-time setname userhost-in-names"
      )
      socket.send("CAP END")
    }

    socket.onmessage = (evt) => {
      if (!mountedRef.current) return
      const raw: string = evt.data
      if (raw.includes(" 001 ") || raw.includes(":Welcome")) {
        socket.send(`@label=1 JOIN #${roomId}`)
        setStatus("connected")
        setConnected(true)
        return
      }
      if (raw.includes(" PING ") || raw.startsWith("PING ")) {
        const m = raw.match(/PING\s+:?(\S+)/)
        const server = m ? m[1] : "irc-1.idn.app"
        socket.send(`PONG :${server}`)
        return
      }
      const isJoinAck =
        (raw.includes(`JOIN #${roomId}`) && raw.includes(nickRef.current)) ||
        raw.includes("JOINED") ||
        (raw.includes("366") && raw.includes(roomId))
      if (isJoinAck) { setJoined(true); return }

      if (raw.includes(`CHAT #${roomId}`)) {
        try {
          const marker = `:CHAT #${roomId} `
          const idx = raw.indexOf(marker)
          if (idx !== -1) {
            const event = JSON.parse(raw.slice(idx + marker.length))
            if (event.chat?.message) {
              pushMessage({
                id:         makeUuid(),
                userName:   event.user?.name ?? event.user?.username ?? "Unknown",
                userAvatar: event.user?.avatar_url ?? undefined,
                colorCode:  event.user?.color_code ? `#${event.user.color_code}`.replace("##", "#") : undefined,
                levelTier:  event.user?.level_tier ?? undefined,
                message:    String(event.chat.message),
                timestamp:  Date.now(),
              })
            }
          }
        } catch {}
      }
    }

    socket.onclose = (e) => {
      if (!mountedRef.current) return
      wsRef.current = null
      setConnected(false)
      setJoined(false)
      if (e.code !== 1000) {
        setStatus("reconnecting")
        reconnectTimer.current = setTimeout(() => {
          if (mountedRef.current && chatRoomIdRef.current) createSocket(chatRoomIdRef.current)
        }, 4000)
      } else {
        setStatus("idle")
      }
    }

    socket.onerror = () => {
      if (!mountedRef.current) return
      setConnected(false)
      setJoined(false)
      setStatus("reconnecting")
      wsRef.current = null
      reconnectTimer.current = setTimeout(() => {
        if (mountedRef.current && chatRoomIdRef.current) createSocket(chatRoomIdRef.current)
      }, 4000)
    }
  }, [pushMessage])

  useEffect(() => {
    mountedRef.current = true
    chatRoomIdRef.current = chatRoomId
    setMessages([])
    if (!chatRoomId) { setStatus("error"); return }
    createSocket(chatRoomId)
    return () => {
      mountedRef.current = false
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (wsRef.current) {
        try { wsRef.current.close(1000, "unmount") } catch {}
        wsRef.current = null
      }
    }
  }, [chatRoomId, createSocket])

  const retry = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    setMessages([])
    if (chatRoomIdRef.current) createSocket(chatRoomIdRef.current)
  }, [createSocket])

  return { messages, connected, joined, status, retry }
}

// ─── HLS Player ───────────────────────────────────────────────
function HlsPlayer({ src, className }: { src: string; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!src || !videoRef.current) return
    const video = videoRef.current
    let hls: import("hls.js").default | null = null
    let cancelled = false

    const canNativeHLS = video.canPlayType("application/vnd.apple.mpegurl")

    async function setupHlsJs() {
      const { default: Hls } = await import("hls.js")
      if (cancelled || !videoRef.current) return
      if (!Hls.isSupported()) {
        if (canNativeHLS) video.src = src
        return
      }
      hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60 })
      hls.loadSource(src)
      hls.attachMedia(videoRef.current)
    }

    if (canNativeHLS) {
      video.src = src
    } else {
      setupHlsJs()
    }

    return () => { cancelled = true; hls?.destroy() }
  }, [src])

  return <video ref={videoRef} className={className} controls autoPlay playsInline muted />
}

// ─── Quality Selector ──────────────────────────────────────────
function QualitySelector({
  qualities, current, onSelect,
}: {
  qualities: StreamingUrl[]
  current:   StreamingUrl | null
  onSelect:  (q: StreamingUrl) => void
}) {
  const [open, setOpen] = useState(false)
  if (qualities.length <= 1) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-black/80 transition-colors"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
        </svg>
        {current ? current.label : qualities[0]?.label ?? "Auto"}
      </button>
      {open && (
        <div className="absolute bottom-[calc(100%+6px)] right-0 z-30 min-w-[160px] rounded-2xl border border-white/10 bg-gray-900/95 backdrop-blur-xl p-2 shadow-2xl">
          <p className="px-2 pb-1.5 text-[9px] font-bold uppercase tracking-widest text-white/30">Kualitas</p>
          {qualities.map(q => (
            <button
              key={q.label + q.quality}
              onClick={() => { onSelect(q); setOpen(false) }}
              className={`mb-0.5 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors ${
                current?.url === q.url ? "bg-white/10 text-white font-bold" : "text-white/60 hover:bg-white/5"
              }`}
            >
              <span>{q.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Live Chat Panel (read-only, live from IDN wss://chat.idn.app/) ──
function LiveChatPanel({ chatRoomId }: { chatRoomId: string | null }) {
  const { messages, connected, joined, status, retry } = useIdnChatReadOnly(chatRoomId)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  const statusText =
    connected && joined ? "Chat terhubung"
    : connected && !joined ? "Bergabung ke room..."
    : status === "reconnecting" ? "Menyambung ulang..."
    : status === "connecting" ? "Menghubungkan..."
    : status === "error" ? "Chat tidak tersedia"
    : "Chat offline"

  const statusColor =
    connected && joined ? "bg-green-500"
    : connected ? "bg-yellow-500"
    : status === "reconnecting" || status === "connecting" ? "bg-yellow-500"
    : "bg-white/20"

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <span className={`inline-flex h-2 w-2 rounded-full ${statusColor}`} />
          <span className="text-sm font-semibold text-white">Live Chat</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/40">Read-only</span>
        </div>
        <span className="text-xs text-white/30 tabular-nums">{messages.length} pesan</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-10 text-center">
            <div className="h-10 w-10 rounded-2xl bg-white/5 flex items-center justify-center">
              <svg className="h-5 w-5 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-white/30">{statusText}</p>
              <p className="text-xs text-white/20 mt-0.5">
                {status === "error" ? "Room chat tidak tersedia untuk live ini." : "Pesan dari chat IDN akan muncul di sini."}
              </p>
            </div>
            {status === "reconnecting" || status === "error" ? (
              <button onClick={retry} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20 transition-colors">
                Coba Lagi
              </button>
            ) : null}
          </div>
        )}
        {messages.map(msg => {
          const accent = msg.colorCode || "#DC1F2E"
          return (
            <div key={msg.id} className="flex gap-2.5 items-start group">
              <div
                className="shrink-0 h-7 w-7 rounded-full overflow-hidden flex items-center justify-center ring-1"
                style={{ backgroundColor: accent + "22", borderColor: accent + "55" }}
              >
                {msg.userAvatar ? (
                  <img src={msg.userAvatar} alt={msg.userName} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[10px] font-bold" style={{ color: accent }}>{getInitials(msg.userName)}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                  <span className="text-xs font-semibold leading-none truncate max-w-[120px]" style={{ color: accent }}>
                    {msg.userName}
                  </span>
                  {msg.levelTier != null && (
                    <span className="rounded px-1 py-0.5 text-[9px] font-bold text-white/40 bg-white/5">Lv{msg.levelTier}</span>
                  )}
                  <span className="text-[10px] text-white/20 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                    {formatHHMM(msg.timestamp)}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-white/50 break-words">{msg.message}</p>
              </div>
            </div>
          )
        })}
        <div ref={chatEndRef} />
      </div>

      <div className="px-3 py-2.5 border-t border-white/10 shrink-0">
        <p className="text-[10px] text-white/25 text-center">{statusText} · chat hanya bisa dibaca</p>
      </div>
    </div>
  )
}

// ─── Player View ────────────────────────────────────────────────
function PlayerView({ show }: { show: LiveShow }) {
  const [currentQuality, setCurrentQuality] = useState<StreamingUrl | null>(null)
  const roomKey = show.identifier || show.slug
  const viewerCount = useViewerCount(roomKey)

  const activeUrl = currentQuality?.url ?? show.streaming_url_list[0]?.url ?? null

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <img src={show.img_alt || show.img} alt={show.name} className="h-7 w-7 rounded-full object-cover shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{show.name}</p>
            <p className="text-xs text-white/40 truncate">{show.url_key}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {viewerCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/70">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {viewerCount.toLocaleString("id-ID")}
            </span>
          )}
          <div className="relative flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold">
            <span className="absolute h-1.5 w-1.5 rounded-full bg-white animate-ping" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-white" />
            LIVE
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row min-h-0">
        <div className="flex flex-col flex-1 min-w-0">

          {/* ── Video player ── */}
          <div className="relative w-full bg-black shrink-0" style={{ aspectRatio: "16/9" }}>
            <img
              src={show.img}
              alt={show.name}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity ${activeUrl ? "opacity-0" : "opacity-60"}`}
            />
            {activeUrl ? (
              <HlsPlayer src={activeUrl} className="absolute inset-0 h-full w-full object-contain bg-black" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                <p className="text-sm text-white/40">Stream tidak tersedia</p>
              </div>
            )}

            {show.streaming_url_list.length > 1 && (
              <div className="absolute bottom-3 right-3 z-20">
                <QualitySelector
                  qualities={show.streaming_url_list}
                  current={currentQuality}
                  onSelect={setCurrentQuality}
                />
              </div>
            )}
          </div>

          {/* ── Info bar ── */}
          <div className="px-4 py-4 space-y-3 border-b border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1.5 min-w-0">
                <h1 className="text-base font-semibold leading-snug">{show.name}</h1>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="flex items-center gap-1 rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-semibold text-red-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />LIVE
                  </span>
                  <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/50 uppercase">{show.type}</span>
                </div>
              </div>
              <img src={show.img_alt || show.img} alt={show.name} className="h-9 w-9 rounded-full object-cover ring-1 ring-white/20 shrink-0" />
            </div>

            {show.started_at && (
              <div className="flex items-center gap-2 text-xs text-white/50">
                <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Mulai {formatStartedAt(show.started_at)}
              </div>
            )}
          </div>
        </div>

        {/* ── Chat panel ── */}
        <div className="w-full lg:w-80 xl:w-96 border-t lg:border-t-0 lg:border-l border-white/10 flex flex-col shrink-0 lg:h-[calc(100vh-57px)] lg:sticky lg:top-[57px]">
          <LiveChatPanel chatRoomId={show.chat_room_id || null} />
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────
export default function LiveSlugPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ""

  const [show,    setShow]    = useState<LiveShow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState("")

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadShow = useCallback(async () => {
    try {
      const res  = await fetch(LIVE_API)
      const data = await res.json()
      const list: LiveShow[] = Array.isArray(data) ? data : []
      const found = list.find(s => s.slug === slug)
      if (found) {
        setShow(found)
        setError("")
      } else {
        setShow(null)
        setError("Live tidak ditemukan atau sudah berakhir.")
      }
    } catch {
      setError("Gagal memuat data live.")
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    loadShow()
    pollingRef.current = setInterval(loadShow, 20000)
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [loadShow])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          <p className="text-sm text-white/50">Memuat live...</p>
        </div>
      </div>
    )
  }

  if (error || !show) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 ring-1 ring-red-500/30">
            <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <p className="font-semibold text-white">Live Tidak Ditemukan</p>
          <p className="text-sm text-white/40">{error || "Slug tidak valid."}</p>
          <button onClick={loadShow} className="w-full rounded-xl bg-white/10 py-2.5 text-sm font-medium text-white hover:bg-white/15 transition-colors">
            Coba Lagi
          </button>
        </div>
      </div>
    )
  }

  return <PlayerView show={show} />
}
