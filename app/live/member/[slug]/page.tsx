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
  slug?:              string
  room_id:            number
  live_id?:           number
  is_graduate:        boolean
  is_group:           boolean
  chat_room_id?:      string
  started_at:         string
  type:               string
  identifier?:        string
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
      // Server can batch multiple IRC lines in a single WS frame, separated by CRLF/LF.
      const lines = raw.split(/\r\n|\r|\n/).filter(Boolean)

      for (const line of lines) {
        if (line.includes(" 001 ") || line.includes(":Welcome")) {
          socket.send(`@label=1 JOIN #${roomId}`)
          setStatus("connected")
          setConnected(true)
          continue
        }

        if (line.includes(" PING ") || line.startsWith("PING ")) {
          const m = line.match(/PING\s+:?(\S+)/)
          const server = m ? m[1] : "irc-1.idn.app"
          socket.send(`PONG :${server}`)
          continue
        }

        const isJoinAck =
          (line.includes(`JOIN #${roomId}`) && line.includes(nickRef.current)) ||
          line.includes("JOINED") ||
          (line.includes(" 366 ") && line.includes(roomId))
        if (isJoinAck) { setJoined(true); continue }

        // Match "PRIVMSG #<channel> :<json...>" regardless of prefix/tags before it.
        const privmsgMatch = line.match(/PRIVMSG\s+#(\S+)\s+:(\{.*\})\s*$/)
        if (privmsgMatch) {
          const [, channel, payload] = privmsgMatch
          // Loosen the comparison in case of trailing chars / encoding quirks.
          const channelMatches =
            channel === roomId || channel.endsWith(roomId) || roomId.endsWith(channel)
          if (!channelMatches) continue
          try {
            const event = JSON.parse(payload)
            if (event.chat?.message) {
              pushMessage({
                id:         event.chat?.id || makeUuid(),
                userName:   event.user?.name ?? event.user?.username ?? "Unknown",
                userAvatar: event.user?.avatar_url ?? undefined,
                colorCode:  event.user?.color_code ? `#${event.user.color_code}`.replace("##", "#") : undefined,
                levelTier:  event.user?.level_tier ?? undefined,
                message:    String(event.chat.message),
                timestamp:  Date.now(),
              })
            }
          } catch (err) {
            if (process.env.NODE_ENV !== "production") {
              console.warn("[idn-chat] failed to parse PRIVMSG payload", err, line)
            }
          }
        }
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

// ─── useTopGifters ───────────────────────────────────────────────
// IDN-only leaderboard/podium. Lazy: only polls while `enabled` is
// true (i.e. while the person actually has the Gift tab open).
interface TopGifter {
  rank:         number
  uuid:         string
  name:         string
  username:     string
  image_url:    string | null
  level_tier:   number
  total_gold:   number
  total_point:  number
}

function useTopGifters(slug: string | null, enabled: boolean) {
  const [gifters, setGifters] = useState<TopGifter[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(false)
  const mountedRef = useRef(true)
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchGifters = useCallback(async () => {
    if (!slug || !mountedRef.current) return
    setLoading(true)
    try {
      const res = await fetch(
        `https://v5.jkt48connect.com/api/jkt48/live/idn/top-gifter?apikey=JKTCONNECT&slug=${encodeURIComponent(slug)}`
      )
      const json = await res.json()
      if (!mountedRef.current) return
      if (json?.success && Array.isArray(json?.data)) {
        setGifters(json.data)
        setError(false)
      } else {
        setError(true)
      }
    } catch {
      if (mountedRef.current) setError(true)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    mountedRef.current = true
    if (!enabled || !slug) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      return
    }
    fetchGifters()
    timerRef.current = setInterval(fetchGifters, 30000)
    return () => {
      mountedRef.current = false
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [enabled, slug, fetchGifters])

  return { gifters, loading, error, retry: fetchGifters }
}

// ─── useShowroomCommentsReadOnly ────────────────────────────────
// Polls Showroom's public comment_log endpoint every 5s (read-only,
// no login/post — mirrors the RN app's comment polling behavior).
function useShowroomCommentsReadOnly(roomId: number | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(false)
  const [lastPoll, setLastPoll] = useState<Date | null>(null)
  const mountedRef = useRef(true)
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchComments = useCallback(async () => {
    if (!roomId || !mountedRef.current) return
    try {
      const res = await fetch(`https://www.showroom-live.com/api/live/comment_log?room_id=${roomId}`, {
        headers: { Accept: "application/json" },
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = await res.json()
      const parsed: ChatMessage[] = (data?.comment_log ?? [])
        .map((c: any) => ({
          id:         `${c.user_id}-${c.created_at}`,
          userName:   c.name ?? "Unknown",
          userAvatar: c.avatar_url || undefined,
          levelTier:  c.class_level ?? undefined,
          message:    c.comment ?? "",
          timestamp:  (c.created_at ?? 0) * 1000,
        }))
        .sort((a: ChatMessage, b: ChatMessage) => a.timestamp - b.timestamp)
      if (!mountedRef.current) return
      setMessages(parsed)
      setLastPoll(new Date())
      setError(false)
    } catch {
      if (mountedRef.current) setError(true)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [roomId])

  useEffect(() => {
    mountedRef.current = true
    setMessages([])
    if (!roomId) { setLoading(false); return }
    setLoading(true)
    fetchComments()
    timerRef.current = setInterval(fetchComments, 5000)
    return () => {
      mountedRef.current = false
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [roomId, fetchComments])

  return { messages, loading, error, lastPoll, retry: fetchComments }
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

// ─── Gift Podium (top 3 + ranked list) ─────────────────────────
function GiftPodium({
  gifters, loading, error, onRetry,
}: {
  gifters: TopGifter[]
  loading: boolean
  error:   boolean
  onRetry: () => void
}) {
  if (loading && gifters.length === 0) {
    return (
      <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 py-6">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-yellow-500" />
        <p className="text-xs text-white/30">Memuat top gifter...</p>
      </div>
    )
  }
  if (error && gifters.length === 0) {
    return (
      <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 py-6 text-center px-4">
        <p className="text-sm font-medium text-white/30">Gagal memuat leaderboard</p>
        <button onClick={onRetry} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20 transition-colors">
          Coba Lagi
        </button>
      </div>
    )
  }
  if (gifters.length === 0) {
    return (
      <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 py-6 text-center px-4">
        <svg className="h-6 w-6 text-white/15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 12v10H4V12M22 7H2v5h20V7zM12 22V7M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
        </svg>
        <p className="text-xs text-white/30">Belum ada gifter</p>
      </div>
    )
  }

  const podium = [gifters[1], gifters[0], gifters[2]].filter(Boolean) as TopGifter[]
  const rest   = gifters.slice(3)

  const podiumStyle = (rank: number) => {
    if (rank === 1) return { h: "h-24", ring: "ring-yellow-400/60", badge: "bg-yellow-400 text-black", crown: true }
    if (rank === 2) return { h: "h-16", ring: "ring-white/30", badge: "bg-white/20 text-white", crown: false }
    return { h: "h-12", ring: "ring-orange-400/40", badge: "bg-orange-400/30 text-orange-200", crown: false }
  }

  return (
    <div className="px-3 py-4 space-y-5">
      {/* Podium */}
      <div className="flex items-end justify-center gap-2 px-2">
        {podium.map(g => {
          const s = podiumStyle(g.rank)
          return (
            <div key={g.uuid ?? g.rank} className="flex flex-1 max-w-[110px] flex-col items-center gap-1.5">
              <div className="relative">
                {s.crown && (
                  <svg className="absolute -top-4 left-1/2 -translate-x-1/2 h-4 w-4 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M5 16L3 6l5.5 4L12 4l3.5 6L21 6l-2 10H5zm0 2h14v2H5v-2z" />
                  </svg>
                )}
                <div className={`h-12 w-12 rounded-full overflow-hidden bg-white/10 ring-2 ${s.ring}`}>
                  {g.image_url ? (
                    <img src={g.image_url} alt={g.name} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-xs font-bold text-white/50">
                      {getInitials(g.name)}
                    </div>
                  )}
                </div>
                <span className={`absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full px-1.5 py-0.5 text-[9px] font-black ${s.badge}`}>
                  #{g.rank}
                </span>
              </div>
              <p className="mt-1.5 max-w-full truncate text-[11px] font-semibold text-white/80">{g.name}</p>
              <div className="flex items-center gap-1">
                <svg className="h-2.5 w-2.5 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 12v10H4V12M22 7H2v5h20V7zM12 22V7M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
                </svg>
                <span className="text-[10px] font-bold text-yellow-400/90 tabular-nums">{g.total_gold?.toLocaleString("id-ID")}</span>
              </div>
              <div className={`w-full rounded-t-lg bg-white/5 ${s.h}`} />
            </div>
          )
        })}
      </div>

      {/* Ranked list (4th onward) */}
      {rest.length > 0 && (
        <div className="space-y-1.5">
          {rest.map(g => (
            <div key={g.uuid ?? g.rank} className="flex items-center gap-2.5 rounded-xl bg-white/[0.03] px-2.5 py-2">
              <div className="flex h-6 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-black/30">
                <span className="text-[10px] font-bold text-white/40">#{g.rank}</span>
              </div>
              <div className="h-7 w-7 shrink-0 rounded-full overflow-hidden bg-white/10">
                {g.image_url ? (
                  <img src={g.image_url} alt={g.name} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-[9px] font-bold text-white/50">
                    {getInitials(g.name)}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-xs font-medium text-white/70">{g.name}</p>
                <p className="truncate text-[10px] text-white/25">@{g.username} · Lv{g.level_tier}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <svg className="h-2.5 w-2.5 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 12v10H4V12M22 7H2v5h20V7zM12 22V7M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
                </svg>
                <span className="text-[10px] font-bold text-yellow-400/80 tabular-nums">{g.total_gold?.toLocaleString("id-ID")}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Live Chat Panel (read-only) ───────────────────────────────
// IDN      → live from wss://chat.idn.app/
// Showroom → polling https://www.showroom-live.com/api/live/comment_log
//
// Scroll is locked to an internal container (never the page/window),
// auto-follow only kicks in while the user is already near the bottom,
// and messages can be hidden/shown without the panel changing height.
function LiveChatPanel({ show }: { show: LiveShow }) {
  const isShowroom = show.type?.toLowerCase() === "showroom"
  const canShowGift = !isShowroom && !!show.slug

  const idnChat = useIdnChatReadOnly(!isShowroom ? (show.chat_room_id || null) : null)
  const srChat  = useShowroomCommentsReadOnly(isShowroom ? (show.room_id ?? null) : null)

  const [chatOpen,     setChatOpen]     = useState(true)
  const [activeTab,    setActiveTab]    = useState<"chat" | "gift">("chat")
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [newCount,     setNewCount]     = useState(0)

  const giftEnabled = chatOpen && activeTab === "gift" && canShowGift
  const { gifters, loading: giftersLoading, error: giftersError, retry: retryGifters } =
    useTopGifters(canShowGift ? (show.slug ?? null) : null, giftEnabled)

  const scrollRef   = useRef<HTMLDivElement>(null)
  const prevLenRef   = useRef(0)

  const messages   = isShowroom ? srChat.messages : idnChat.messages
  // Cap what actually renders to the DOM — heavy chat rooms can push
  // hundreds of lines/minute; only the tail is visually relevant.
  const visible    = messages.slice(-120)

  const statusText = isShowroom
    ? (srChat.loading && srChat.messages.length === 0 ? "Memuat komentar..."
      : srChat.error ? "Gagal memuat komentar"
      : "Komentar terhubung")
    : (idnChat.connected && idnChat.joined ? "Chat terhubung"
      : idnChat.connected && !idnChat.joined ? "Bergabung ke room..."
      : idnChat.status === "reconnecting" ? "Menyambung ulang..."
      : idnChat.status === "connecting" ? "Menghubungkan..."
      : idnChat.status === "error" ? "Chat tidak tersedia"
      : "Chat offline")

  const statusColor = isShowroom
    ? (srChat.error ? "bg-red-500" : srChat.loading ? "bg-yellow-500" : "bg-green-500")
    : (idnChat.connected && idnChat.joined ? "bg-green-500"
      : idnChat.connected ? "bg-yellow-500"
      : idnChat.status === "reconnecting" || idnChat.status === "connecting" ? "bg-yellow-500"
      : "bg-white/20")

  const canRetry = isShowroom
    ? srChat.error
    : (idnChat.status === "reconnecting" || idnChat.status === "error")
  const retry = isShowroom ? srChat.retry : idnChat.retry

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" })
    setNewCount(0)
    setIsNearBottom(true)
  }, [])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const near = distanceFromBottom < 72
    setIsNearBottom(near)
    if (near) setNewCount(0)
  }, [])

  // Auto-follow: only scroll the internal container, never the page.
  useEffect(() => {
    const grew = messages.length - prevLenRef.current
    prevLenRef.current = messages.length
    if (grew <= 0 || !chatOpen) return
    if (isNearBottom) {
      requestAnimationFrame(() => scrollToBottom(true))
    } else {
      setNewCount(c => Math.min(c + grew, 99))
    }
  }, [messages.length, chatOpen, isNearBottom, scrollToBottom])

  // Jump to bottom once when opening the panel.
  useEffect(() => {
    if (chatOpen) requestAnimationFrame(() => scrollToBottom(false))
  }, [chatOpen]) // eslint-disable-line

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header — always visible, toggles the panel below */}
      <button
        onClick={() => setChatOpen(v => !v)}
        className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={`inline-flex h-2 w-2 shrink-0 rounded-full ${statusColor}`} />
          <span className="text-sm font-semibold text-white">{isShowroom ? "Komentar Live" : "Live Chat"}</span>
          <span className="hidden sm:inline-flex rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/40">Read-only</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-white/30 tabular-nums">{messages.length}</span>
          <svg
            className={`h-4 w-4 text-white/40 transition-transform ${chatOpen ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {chatOpen ? (
        <div className="relative flex-1 min-h-0">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="h-full overflow-y-auto overscroll-contain px-3 py-3 space-y-3"
          >
            {visible.length === 0 && (
              <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 py-6 text-center">
                <div className="h-10 w-10 rounded-2xl bg-white/5 flex items-center justify-center">
                  <svg className="h-5 w-5 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-white/30">{statusText}</p>
                  <p className="text-xs text-white/20 mt-0.5">
                    {isShowroom ? "Komentar dari Showroom akan muncul di sini." : "Pesan dari chat IDN akan muncul di sini."}
                  </p>
                </div>
                {canRetry && (
                  <button onClick={retry} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20 transition-colors">
                    Coba Lagi
                  </button>
                )}
              </div>
            )}
            {visible.map(msg => {
              const accent = msg.colorCode || (isShowroom ? "#FF4F6D" : "#DC1F2E")
              return (
                <div key={msg.id} className="flex gap-2.5 items-start group">
                  <div
                    className="shrink-0 h-7 w-7 rounded-full overflow-hidden flex items-center justify-center ring-1"
                    style={{ backgroundColor: accent + "22", borderColor: accent + "55" }}
                  >
                    {msg.userAvatar ? (
                      <img src={msg.userAvatar} alt={msg.userName} className="h-full w-full object-cover" loading="lazy" />
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
          </div>

          {/* Floating "new messages" pill — only shown when scrolled up */}
          {newCount > 0 && (
            <button
              onClick={() => scrollToBottom(true)}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-white text-black px-3 py-1.5 text-xs font-semibold shadow-lg hover:bg-white/90 transition-colors"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
              {newCount}{newCount >= 99 ? "+" : ""} pesan baru
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-2 px-4 text-center">
          <svg className="h-6 w-6 text-white/15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.774 3.162 10.065 7.498a10.522 10.522 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
          </svg>
          <p className="text-xs text-white/30">Komentar disembunyikan</p>
          <button
            onClick={() => setChatOpen(true)}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition-colors"
          >
            Tampilkan Komentar
          </button>
        </div>
      )}

      <div className="shrink-0 border-t border-white/10 px-3 py-2">
        <p className="text-[10px] text-white/25 text-center truncate">
          {statusText}
          {isShowroom && srChat.lastPoll ? ` · update ${formatHHMM(srChat.lastPoll.getTime())}` : ""}
          {" · "}{isShowroom ? "polling 5 detik" : "hanya bisa dibaca"}
        </p>
      </div>
    </div>
  )
}

// ─── Player View ────────────────────────────────────────────────
// Fixed-viewport app shell: the outer frame never scrolls (h-dvh +
// overflow-hidden). Each panel owns its own internal scroll region,
// so a fast-moving chat can never drag the whole page down with it.
function PlayerView({ show }: { show: LiveShow }) {
  const [currentQuality, setCurrentQuality] = useState<StreamingUrl | null>(null)
  const roomKey = show.identifier || show.slug || show.url_key
  const viewerCount = useViewerCount(roomKey)

  const activeUrl = currentQuality?.url ?? show.streaming_url_list[0]?.url ?? null

  return (
    <div className="h-dvh w-full overflow-hidden bg-[#0a0a0a] text-white flex flex-col">

      {/* ── Header ── */}
      <header className="flex shrink-0 items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          <img src={show.img_alt || show.img} alt={show.name} className="h-7 w-7 rounded-full object-cover shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{show.name}</p>
            <p className="text-xs text-white/40 truncate">{show.url_key}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {viewerCount > 0 && (
            <span className="hidden sm:flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/70">
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

      {/* ── Body: video+info column | chat column ── */}
      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">

        {/* Video + info — its own scroll region, independent of chat */}
        <div className="flex flex-col min-h-0 shrink-0 lg:flex-1 lg:min-w-0 overflow-y-auto">
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

          {/* Compact info strip */}
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 border-b border-white/10">
            <h1 className="text-sm font-semibold leading-snug truncate max-w-full">{show.name}</h1>
            <span className="flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-400 shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />LIVE
            </span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/50 uppercase shrink-0">{show.type}</span>
            {show.started_at && (
              <span className="flex items-center gap-1 text-[11px] text-white/40 shrink-0 ml-auto">
                <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {formatStartedAt(show.started_at)}
              </span>
            )}
          </div>
        </div>

        {/* Chat column — flexes to fill remaining space on mobile,
            fixed-width sidebar on large screens */}
        <div className="flex flex-1 min-h-0 w-full flex-col border-t border-white/10 lg:w-80 lg:flex-none xl:w-96 lg:border-t-0 lg:border-l">
          <LiveChatPanel show={show} />
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
      const found = list.find(s => s.slug === slug || s.url_key === slug)
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
