"use client"

import { useEffect, useState, useRef, useCallback } from "react"

// ─── Constants ──────────────────────────────────────────────
const IDN_API   = "https://v5.jkt48connect.com/api/jkt48/idnplus?apikey=JKTCONNECT"
const TEAM48_API = "https://v5.jkt48connect.com/api/team48"
const API_KEY   = "JKTCONNECT"
const POLL_MS   = 10000

// ─── Types ──────────────────────────────────────────────────
interface IdnShow {
  slug:            string
  title:           string
  image_url:       string | null
  status:          string
  scheduled_at:    number | null
  live_at:         number | null
  end_at:          number | null
  playback_url:    string | null
  room_identifier: string | null
  showId:          string
  creator: {
    name:      string
    image_url: string | null
    username:  string
  }
  idnliveplus: {
    liveroom_price: number | null
    description:    string | null
  } | null
}

interface StreamSource {
  type:       "rtmp" | "youtube"
  label:      string
  url:        string
  video_id?:  string | null
  embed_url?: string | null
  is_active:  boolean
}

interface StreamData {
  source_type: string
  sources:     StreamSource[]
  rtmp: { url: string; label: string } | null
  youtube: { url: string; video_id: string | null; embed_url: string | null; label: string } | null
}

// ─── Helpers ────────────────────────────────────────────────
function getAccessToken(): string | null {
  if (typeof document === "undefined") return null
  const m = document.cookie.match(/(?:^|;\s*)t48_access_token=([^;]*)/)
  return m ? decodeURIComponent(m[1]) : null
}

function getUserFromCookie(): { username?: string; avatar?: string } | null {
  if (typeof document === "undefined") return null
  const m = document.cookie.match(/(?:^|;\s*)t48_user=([^;]*)/)
  if (!m) return null
  try { return JSON.parse(decodeURIComponent(m[1])) } catch { return null }
}

function pad(n: number) { return String(n).padStart(2, "0") }

function formatSchedule(ts: number) {
  const d = new Date(ts * 1000)
  return d.toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "Asia/Jakarta",
  }) + " · " + d.toLocaleTimeString("id-ID", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
  }) + " WIB"
}

// Pick show closest to now (prefer live > soonest scheduled > most recent ended)
function pickBestShow(shows: IdnShow[]): IdnShow | null {
  if (!shows.length) return null
  const live = shows.filter(s => s.status === "live")
  if (live.length) return live[0]
  const now = Date.now() / 1000
  const upcoming = shows
    .filter(s => s.status === "scheduled" && s.scheduled_at)
    .sort((a, b) => Math.abs((a.scheduled_at ?? 0) - now) - Math.abs((b.scheduled_at ?? 0) - now))
  if (upcoming.length) return upcoming[0]
  const ended = shows.filter(s => s.status === "ended").sort((a, b) => (b.end_at ?? 0) - (a.end_at ?? 0))
  return ended[0] ?? shows[0]
}

// ─── Countdown hook ──────────────────────────────────────────
function useCountdown(targetTs: number | null) {
  const [diff, setDiff] = useState(0)
  useEffect(() => {
    if (!targetTs) return
    const tick = () => setDiff(Math.max(0, targetTs - Math.floor(Date.now() / 1000)))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [targetTs])
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  const s = diff % 60
  return { diff, h, m, s }
}

// ─── HLS Player (lazy) ──────────────────────────────────────
function HlsPlayer({ src, className }: { src: string; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (!src || !videoRef.current) return
    const video = videoRef.current
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src
      return
    }
    let hls: import("hls.js").default | null = null
    import("hls.js").then(({ default: Hls }) => {
      if (!Hls.isSupported() || !videoRef.current) return
      hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60 })
      hls.loadSource(src)
      hls.attachMedia(videoRef.current)
    })
    return () => { hls?.destroy() }
  }, [src])
  return (
    <video
      ref={videoRef}
      className={className}
      controls
      autoPlay
      playsInline
      muted
    />
  )
}

// ─── Source Switcher ─────────────────────────────────────────
function SourceSwitcher({
  sources,
  active,
  onChange,
}: {
  sources:  StreamSource[]
  active:   string
  onChange: (type: string) => void
}) {
  if (sources.length <= 1) return null
  return (
    <div className="flex gap-2">
      {sources.map(s => (
        <button
          key={s.type}
          onClick={() => onChange(s.type)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            active === s.type
              ? "bg-white text-black"
              : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
          }`}
        >
          {s.type === "youtube" ? (
            <svg className="h-3 w-3 fill-current" viewBox="0 0 24 24">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
          ) : (
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.362a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
          )}
          {s.label}
        </button>
      ))}
    </div>
  )
}

// ─── Show List Item ──────────────────────────────────────────
function ShowListItem({
  show,
  isActive,
  onClick,
}: {
  show:     IdnShow
  isActive: boolean
  onClick:  () => void
}) {
  const now = Date.now() / 1000
  const isLive      = show.status === "live"
  const isScheduled = show.status === "scheduled"
  const soonest     = isScheduled && show.scheduled_at && show.scheduled_at - now < 3600

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
        isActive
          ? "bg-white/15 ring-1 ring-white/30"
          : "hover:bg-white/10"
      }`}
    >
      {/* Thumbnail */}
      <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-white/10">
        {show.image_url && (
          <img src={show.image_url} alt={show.title} className="h-full w-full object-cover" />
        )}
        {isLive && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="flex items-center gap-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              LIVE
            </span>
          </span>
        )}
      </div>
      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{show.title}</p>
        <p className="mt-0.5 text-xs text-white/50">
          {isLive ? "Sedang berlangsung" :
           isScheduled && show.scheduled_at
             ? formatSchedule(show.scheduled_at)
             : "Show selesai"}
        </p>
        {soonest && (
          <span className="mt-1 inline-block rounded-full bg-orange-500/20 px-2 py-0.5 text-[10px] font-medium text-orange-300">
            Segera
          </span>
        )}
      </div>
      {isActive && (
        <div className="shrink-0">
          <svg className="h-4 w-4 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      )}
    </button>
  )
}

// ─── Main Page ───────────────────────────────────────────────
export default function LivePage() {
  const [shows, setShows]           = useState<IdnShow[]>([])
  const [selected, setSelected]     = useState<IdnShow | null>(null)
  const [streamData, setStreamData] = useState<StreamData | null>(null)
  const [activeSource, setActiveSource] = useState<string>("rtmp")
  const [loading, setLoading]       = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [viewerCount, setViewerCount] = useState<number | null>(null)
  const user = typeof window !== "undefined" ? getUserFromCookie() : null
  const isLoggedIn = !!getAccessToken()

  // Countdown
  const countdown = useCountdown(
    selected?.status === "scheduled" ? (selected.scheduled_at ?? null) : null
  )

  // Fetch IDN shows
  const fetchShows = useCallback(async () => {
    try {
      const res  = await fetch(IDN_API)
      const data = await res.json()
      if (Array.isArray(data.data)) {
        setShows(data.data)
        return data.data as IdnShow[]
      }
    } catch (_) {}
    return []
  }, [])

  // Fetch stream source dari team48 API
  const fetchStreamSource = useCallback(async (showId: string) => {
    try {
      const res  = await fetch(`${TEAM48_API}/stream/${showId}?apikey=${API_KEY}`)
      const data = await res.json()
      if (data.status && data.data) {
        setStreamData(data.data)
        // Set default source
        if (data.sources?.length) {
          setActiveSource(data.sources[0].type)
        }
      } else {
        setStreamData(null)
      }
    } catch (_) {
      setStreamData(null)
    }
  }, [])

  // Init
  useEffect(() => {
    fetchShows().then(list => {
      const best = pickBestShow(list)
      if (best) {
        setSelected(best)
        fetchStreamSource(best.showId)
      }
      setLoading(false)
    })
  }, [fetchShows, fetchStreamSource])

  // Poll shows setiap POLL_MS
  useEffect(() => {
    const t = setInterval(() => {
      fetchShows().then(list => {
        setShows(list)
        // Update selected kalau ada perubahan status
        if (selected) {
          const updated = list.find(s => s.showId === selected.showId)
          if (updated) setSelected(updated)
        }
      })
    }, POLL_MS)
    return () => clearInterval(t)
  }, [fetchShows, selected])

  // Simulasi viewer count kalau live
  useEffect(() => {
    if (selected?.status !== "live") { setViewerCount(null); return }
    setViewerCount(Math.floor(Math.random() * 500) + 50)
    const t = setInterval(() => {
      setViewerCount(v => v !== null ? Math.max(1, v + Math.floor((Math.random() - 0.4) * 20)) : null)
    }, 8000)
    return () => clearInterval(t)
  }, [selected?.showId, selected?.status])

  const handleSelectShow = (show: IdnShow) => {
    setSelected(show)
    setStreamData(null)
    fetchStreamSource(show.showId)
    setSidebarOpen(false)
  }

  // Resolve active stream URL
  const activeStreamUrl = (() => {
    if (!streamData) return null
    if (activeSource === "rtmp" && streamData.rtmp?.url) return streamData.rtmp.url
    return null
  })()

  const activeYoutube = (() => {
    if (!streamData) return null
    if (activeSource === "youtube" && streamData.youtube?.embed_url)
      return streamData.youtube.embed_url
    return null
  })()

  // Fallback: pakai playback_url dari IDN kalau tidak ada stream source
  const fallbackUrl = selected?.playback_url ?? null

  const isLive      = selected?.status === "live"
  const isScheduled = selected?.status === "scheduled"
  const isEnded     = selected?.status === "ended"
  const hasStream   = !!(streamData?.sources?.length)
  const showCountdown = isScheduled && countdown.diff > 0

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          <p className="text-sm text-white/50">Memuat jadwal live...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">

      {/* ── Top Bar ─────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          {/* Hamburger untuk show list */}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/15 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <span className="hidden sm:inline">Show Lainnya</span>
          </button>

          {selected && (
            <div className="hidden sm:flex items-center gap-2">
              {selected.creator.image_url && (
                <img
                  src={selected.creator.image_url}
                  alt={selected.creator.name}
                  className="h-6 w-6 rounded-full object-cover"
                />
              )}
              <span className="text-sm font-semibold">{selected.creator.name}</span>
              <span className="text-xs text-white/40">@{selected.creator.username}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isLive && viewerCount !== null && (
            <div className="flex items-center gap-1.5 rounded-full bg-red-500/20 px-3 py-1 text-xs font-medium text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              {viewerCount} penonton
            </div>
          )}
          {user ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/60">Hai, <span className="text-white font-medium">{user.username}</span></span>
            </div>
          ) : (
            <a href="/login" className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20 transition-colors">
              Login
            </a>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar Show List ────────────────────────────── */}
        <aside className={`
          absolute inset-y-0 left-0 z-30 w-80 bg-[#111] border-r border-white/10 flex flex-col
          transition-transform duration-300 lg:relative lg:translate-x-0 lg:w-72
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `} style={{ top: "49px" }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
            <h2 className="text-sm font-semibold text-white/80">Jadwal Show</h2>
            <button onClick={() => setSidebarOpen(false)} className="text-white/40 hover:text-white lg:hidden">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
            {shows.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-white/30">Tidak ada show tersedia</p>
            ) : (
              shows.map(show => (
                <ShowListItem
                  key={show.slug}
                  show={show}
                  isActive={selected?.slug === show.slug}
                  onClick={() => handleSelectShow(show)}
                />
              ))
            )}
          </div>
        </aside>

        {/* ── Overlay backdrop sidebar (mobile) ─────────────── */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/60 lg:hidden"
            style={{ top: "49px" }}
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Main Content ──────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          {!selected ? (
            <div className="flex min-h-full items-center justify-center py-20">
              <p className="text-white/30 text-sm">Tidak ada show tersedia saat ini.</p>
            </div>
          ) : (
            <div className="flex flex-col">

              {/* ── Player / Thumbnail Area ──────────────────── */}
              <div className="relative w-full bg-black" style={{ aspectRatio: "16/9", maxHeight: "70vh" }}>

                {/* Background thumbnail always shown */}
                {selected.image_url && (
                  <img
                    src={selected.image_url}
                    alt={selected.title}
                    className={`absolute inset-0 h-full w-full object-cover ${
                      isLive && (hasStream || fallbackUrl) ? "opacity-0" : "opacity-100"
                    }`}
                  />
                )}

                {/* ── LIVE: YouTube embed ─────────────────────── */}
                {isLive && activeYoutube && (
                  <iframe
                    src={activeYoutube}
                    className="absolute inset-0 h-full w-full"
                    allow="autoplay; encrypted-media; fullscreen"
                    allowFullScreen
                  />
                )}

                {/* ── LIVE: HLS Player ────────────────────────── */}
                {isLive && activeStreamUrl && !activeYoutube && (
                  <HlsPlayer
                    src={activeStreamUrl}
                    className="absolute inset-0 h-full w-full object-contain bg-black"
                  />
                )}

                {/* ── LIVE: Fallback IDN playback ──────────────── */}
                {isLive && !hasStream && fallbackUrl && (
                  <HlsPlayer
                    src={fallbackUrl}
                    className="absolute inset-0 h-full w-full object-contain bg-black"
                  />
                )}

                {/* ── SCHEDULED: Countdown overlay ─────────────── */}
                {showCountdown && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55">
                    <p className="mb-4 text-sm font-semibold tracking-[0.2em] text-white/80 uppercase">
                      Siaran Dimulai Dalam
                    </p>

                    {/* Countdown digits — signature element */}
                    <div className="flex items-center gap-3">
                      {[
                        { val: countdown.h, label: "JAM" },
                        { val: countdown.m, label: "MENIT" },
                        { val: countdown.s, label: "DETIK" },
                      ].map((item, i) => (
                        <div key={item.label} className="flex items-center gap-3">
                          <div className="flex flex-col items-center">
                            <span
                              className="font-mono text-5xl font-black tracking-tight text-white tabular-nums"
                              style={{ textShadow: "0 0 30px rgba(255,255,255,0.3)" }}
                            >
                              {pad(item.val)}
                            </span>
                            <span className="mt-1 text-[10px] font-semibold tracking-widest text-white/50">
                              {item.label}
                            </span>
                          </div>
                          {i < 2 && (
                            <span className="mb-5 text-3xl font-black text-white/40 animate-pulse">:</span>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Coming soon badge */}
                    <div className="mt-5 flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 backdrop-blur-sm">
                      <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                      <span className="text-xs font-semibold tracking-widest text-white/80 uppercase">Coming Soon</span>
                    </div>

                    {selected.scheduled_at && (
                      <p className="mt-3 text-xs text-white/40">
                        {formatSchedule(selected.scheduled_at)}
                      </p>
                    )}
                  </div>
                )}

                {/* ── ENDED overlay ────────────────────────────── */}
                {isEnded && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
                    <svg className="h-10 w-10 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.362a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                    </svg>
                    <p className="mt-3 text-sm font-medium text-white/50">Show telah selesai</p>
                  </div>
                )}

                {/* ── Top-left: LIVE badge ──────────────────────── */}
                {isLive && (
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white shadow-lg">
                    <span className="h-1.5 w-1.5 rounded-full bg-white animate-ping absolute" />
                    <span className="h-1.5 w-1.5 rounded-full bg-white relative" />
                    LIVE
                  </div>
                )}

                {/* ── Source switcher ────────────────────────────── */}
                {isLive && hasStream && streamData?.sources && streamData.sources.length > 1 && (
                  <div className="absolute bottom-3 right-3">
                    <SourceSwitcher
                      sources={streamData.sources}
                      active={activeSource}
                      onChange={setActiveSource}
                    />
                  </div>
                )}
              </div>

              {/* ── Show Info ─────────────────────────────────── */}
              <div className="px-4 py-4 space-y-3 border-b border-white/10">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <h1 className="text-base font-semibold leading-snug text-white">
                      {selected.title}
                    </h1>
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Status badge */}
                      {isLive && (
                        <span className="flex items-center gap-1 rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-semibold text-red-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                          LIVE
                        </span>
                      )}
                      {isScheduled && (
                        <span className="rounded-full bg-blue-500/20 px-2.5 py-0.5 text-xs font-medium text-blue-400">
                          Terjadwal
                        </span>
                      )}
                      {isEnded && (
                        <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/40">
                          Selesai
                        </span>
                      )}
                      {selected.idnliveplus?.liveroom_price != null && (
                        <span className="rounded-full bg-yellow-500/20 px-2.5 py-0.5 text-xs font-medium text-yellow-400">
                          {selected.idnliveplus.liveroom_price} gold
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Creator */}
                  <div className="flex items-center gap-2 shrink-0">
                    {selected.creator.image_url && (
                      <img
                        src={selected.creator.image_url}
                        alt={selected.creator.name}
                        className="h-9 w-9 rounded-full object-cover ring-1 ring-white/20"
                      />
                    )}
                    <div className="hidden sm:block">
                      <p className="text-sm font-semibold text-white">{selected.creator.name}</p>
                      <p className="text-xs text-white/40">@{selected.creator.username}</p>
                    </div>
                  </div>
                </div>

                {/* Schedule info */}
                {isScheduled && selected.scheduled_at && (
                  <div className="flex items-center gap-2 text-xs text-white/50">
                    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {formatSchedule(selected.scheduled_at)}
                  </div>
                )}

                {/* Description */}
                {selected.idnliveplus?.description && (
                  <p className="text-xs text-white/50 leading-relaxed whitespace-pre-line line-clamp-3">
                    {selected.idnliveplus.description.trim()}
                  </p>
                )}

                {/* Stream source info */}
                {isLive && hasStream && streamData?.sources && (
                  <div className="flex items-center gap-2">
                    <SourceSwitcher
                      sources={streamData.sources}
                      active={activeSource}
                      onChange={setActiveSource}
                    />
                  </div>
                )}

                {/* No stream source warning */}
                {isLive && !hasStream && !fallbackUrl && (
                  <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-xs text-yellow-400">
                    Stream belum tersedia. Admin perlu mengatur sumber stream untuk show ini.
                  </div>
                )}
              </div>

              {/* ── Other shows (mobile compact) ─────────────── */}
              <div className="px-4 py-4 lg:hidden">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
                  Show Lainnya
                </h2>
                <div className="space-y-1">
                  {shows.filter(s => s.slug !== selected.slug).slice(0, 3).map(show => (
                    <ShowListItem
                      key={show.slug}
                      show={show}
                      isActive={false}
                      onClick={() => handleSelectShow(show)}
                    />
                  ))}
                </div>
                {shows.length > 4 && (
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="mt-3 w-full rounded-lg border border-white/10 py-2.5 text-xs text-white/40 hover:bg-white/5 transition-colors"
                  >
                    Lihat semua show ({shows.length})
                  </button>
                )}
              </div>

            </div>
          )}
        </main>
      </div>
    </div>
  )
}
