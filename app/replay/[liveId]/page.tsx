"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useParams } from "next/navigation"

// ─── Constants ────────────────────────────────────────────────
const API_BASE = "https://v5.jkt48connect.com/api/team48"
const API_KEY  = "JKTCONNECT"
const LS_PREFIX = "t48_replay_access_"

// ─── Types ────────────────────────────────────────────────────
interface LiveTokenInfo {
  live_id:        string
  show_id:        string | null
  label:          string
  max_uses:       number | null
  uses_count:     number
  uses_remaining: number | null
  expires_at:     string | null
  is_active:      boolean
  is_expired:     boolean
  is_maxed:       boolean
  is_usable:      boolean
  notes:          string | null
}

interface ReplayItem {
  id?:           number
  show_id:       string
  title:         string
  youtube_url:   string | null
  rtmp_url:      string | null
  thumbnail_url: string | null
  created_at:    string
}

interface CachedAccess {
  liveId:     string
  consumedAt: number
  expiresAt:  number | null
}

type VerifyState =
  | "checking"
  | "verifying"
  | "granted"
  | "membership"
  | "denied"
  | "error"

// ─── Helpers ──────────────────────────────────────────────────
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return m ? decodeURIComponent(m[1]) : null
}

function getUserFromStorage(): {
  user_id?: string
  username?: string
  membership_type?: string
  membership_expired_at?: string
} | null {
  if (typeof window === "undefined") return null
  try {
    const raw = getCookie("t48_user")
    if (raw) return JSON.parse(raw)
    const ls = localStorage.getItem("t48_user")
    if (ls) return JSON.parse(ls)
  } catch {}
  return null
}

function isMembershipActive(type?: string, expiredAt?: string | null): boolean {
  if (!type || type === "free") return false
  if (!expiredAt) return false
  return new Date(expiredAt) > new Date()
}

function readCachedAccess(liveId: string): CachedAccess | null {
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}${liveId}`)
    if (!raw) return null
    const data = JSON.parse(raw) as CachedAccess
    if (data.expiresAt && Date.now() > data.expiresAt) {
      localStorage.removeItem(`${LS_PREFIX}${liveId}`)
      return null
    }
    return data
  } catch { return null }
}

function writeCachedAccess(data: CachedAccess) {
  try { localStorage.setItem(`${LS_PREFIX}${data.liveId}`, JSON.stringify(data)) } catch {}
}

function getYoutubeEmbedUrl(urlOrId: string | null): string | null {
  if (!urlOrId) return null
  // Already an ID (11 chars alphanumeric)
  if (/^[a-zA-Z0-9_-]{11}$/.test(urlOrId)) {
    return `https://www.youtube.com/embed/${urlOrId}?autoplay=1&rel=0`
  }
  const m = urlOrId.match(/(?:youtube\.com\/(?:watch\?v=|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  if (m) return `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0`
  return null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta",
  })
}

// ─── HLS Player ───────────────────────────────────────────────
function HlsPlayer({ src, className }: { src: string; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (!src || !videoRef.current) return
    const video = videoRef.current
    if (video.canPlayType("application/vnd.apple.mpegurl")) { video.src = src; return }
    let hls: import("hls.js").default | null = null
    import("hls.js").then(({ default: Hls }) => {
      if (!Hls.isSupported() || !videoRef.current) return
      hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60 })
      hls.loadSource(src)
      hls.attachMedia(videoRef.current)
    })
    return () => { hls?.destroy() }
  }, [src])
  return <video ref={videoRef} className={className} controls autoPlay playsInline />
}

// ─── Verify Screen ────────────────────────────────────────────
function VerifyScreen({
  state,
  tokenInfo,
  liveId,
  errorMsg,
  onRetry,
}: {
  state:     VerifyState
  tokenInfo: LiveTokenInfo | null
  liveId:    string
  errorMsg:  string
  onRetry:   () => void
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-4">
      <div className="w-full max-w-sm space-y-6 text-center">

        {/* Logo/header */}
        <div className="space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10">
            <svg className="h-7 w-7 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.362a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/30">
            JKT48 Replay
          </p>
        </div>

        {/* checking / verifying */}
        {(state === "checking" || state === "verifying") && (
          <div className="space-y-3">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            <p className="text-sm text-white/50">
              {state === "checking" ? "Memverifikasi akses..." : "Mengaktifkan tiket..."}
            </p>
          </div>
        )}

        {/* denied */}
        {state === "denied" && (
          <div className="space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 ring-1 ring-red-500/30">
              <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-white">Akses Ditolak</p>
              <p className="text-sm text-white/40">
                {errorMsg || "Token tidak valid, sudah digunakan, atau expired."}
              </p>
            </div>
            {tokenInfo && (
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left space-y-1 text-xs text-white/40">
                <p className="font-mono break-all">{liveId}</p>
                {tokenInfo.is_expired && <p className="text-red-400">⚠ Token sudah expired</p>}
                {tokenInfo.is_maxed   && <p className="text-red-400">⚠ Batas penggunaan tercapai ({tokenInfo.max_uses}x)</p>}
                {!tokenInfo.is_active && <p className="text-red-400">⚠ Token dinonaktifkan admin</p>}
              </div>
            )}
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/40 text-left space-y-1">
              <p className="text-white/60 font-medium">Cara mendapatkan akses:</p>
              <p>· Gunakan live token yang valid di URL: <span className="font-mono text-white/50">/replay/[token]</span></p>
              <p>· Atau aktifkan membership Team48</p>
            </div>
          </div>
        )}

        {/* error */}
        {state === "error" && (
          <div className="space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yellow-500/10 ring-1 ring-yellow-500/30">
              <svg className="h-8 w-8 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="font-semibold text-white">Terjadi Kesalahan</p>
            <p className="text-sm text-white/40">{errorMsg}</p>
            <button onClick={onRetry}
              className="w-full rounded-xl bg-white/10 py-2.5 text-sm font-medium text-white hover:bg-white/15 transition-colors">
              Coba Lagi
            </button>
          </div>
        )}

      </div>
    </div>
  )
}

// ─── Replay Player Modal ──────────────────────────────────────
function ReplayPlayerModal({
  replay,
  onClose,
}: {
  replay:  ReplayItem
  onClose: () => void
}) {
  const embedUrl = getYoutubeEmbedUrl(replay.youtube_url)
  const hasHls   = !!replay.rtmp_url && !embedUrl

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
      onClick={handleBackdrop}
    >
      <div className="w-full max-w-3xl space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between px-1">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/40">Replay</p>
            <h2 className="text-sm font-semibold text-white truncate">{replay.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="ml-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Player */}
        <div className="relative w-full overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: "16/9" }}>
          {embedUrl ? (
            <iframe
              src={embedUrl}
              className="absolute inset-0 h-full w-full"
              allow="autoplay; encrypted-media; fullscreen"
              allowFullScreen
            />
          ) : hasHls ? (
            <HlsPlayer
              src={replay.rtmp_url!}
              className="absolute inset-0 h-full w-full object-contain bg-black"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              {replay.thumbnail_url && (
                <img src={replay.thumbnail_url} alt={replay.title}
                  className="absolute inset-0 h-full w-full object-cover opacity-20" />
              )}
              <div className="relative z-10 flex flex-col items-center gap-2">
                <svg className="h-10 w-10 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.362a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                </svg>
                <p className="text-sm text-white/40">Video tidak tersedia</p>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-white/25">{formatDate(replay.created_at)}</p>
      </div>
    </div>
  )
}

// ─── Replay Grid ──────────────────────────────────────────────
function ReplayGrid({
  replays,
  accessMode,
  liveId,
  user,
  onSignOut,
}: {
  replays:    ReplayItem[]
  accessMode: "token" | "membership"
  liveId:     string
  user:       { username?: string } | null
  onSignOut?: () => void
}) {
  const [activeReplay, setActiveReplay] = useState<ReplayItem | null>(null)
  const [search,       setSearch]       = useState("")

  const filtered = replays.filter(r =>
    r.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">

      {/* Top Bar */}
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[#0a0a0a]/90 backdrop-blur-md">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/8 ring-1 ring-white/10">
              <svg className="h-4 w-4 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.362a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">JKT48 Replay</p>
              <p className="text-[10px] text-white/30 mt-0.5">{replays.length} video tersedia</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {accessMode === "membership" ? (
              <span className="flex items-center gap-1 rounded-full bg-blue-500/20 px-2.5 py-1 text-xs font-medium text-blue-300">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
                Member
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-2.5 py-1 text-xs font-medium text-green-300">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                </svg>
                Tiket Aktif
              </span>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30"
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari replay..."
              className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-4 text-sm text-white placeholder-white/25 outline-none focus:border-white/20 focus:bg-white/8 transition-colors"
            />
          </div>
        </div>
      </header>

      {/* Grid */}
      <main className="flex-1 px-4 py-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <svg className="h-10 w-10 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.362a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
            <p className="text-sm text-white/30">
              {search ? "Tidak ada replay yang cocok" : "Belum ada replay tersedia"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(replay => {
              const hasVideo = !!replay.youtube_url || !!replay.rtmp_url
              return (
                <button
                  key={replay.show_id}
                  onClick={() => setActiveReplay(replay)}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-left transition-all hover:border-white/20 hover:bg-white/8 active:scale-[0.98]"
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-video w-full overflow-hidden bg-white/5">
                    {replay.thumbnail_url ? (
                      <img
                        src={replay.thumbnail_url}
                        alt={replay.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/3">
                        <svg className="h-8 w-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.362a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                        </svg>
                      </div>
                    )}

                    {/* Overlay gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                    {/* Play button */}
                    <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${hasVideo ? "opacity-0 group-hover:opacity-100" : "opacity-0"}`}>
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg">
                        <svg className="h-5 w-5 translate-x-0.5 text-black" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>

                    {/* No video badge */}
                    {!hasVideo && (
                      <div className="absolute bottom-2 left-2">
                        <span className="rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/40">
                          Tidak tersedia
                        </span>
                      </div>
                    )}

                    {/* YouTube badge */}
                    {replay.youtube_url && (
                      <div className="absolute bottom-2 right-2">
                        <span className="flex items-center gap-1 rounded-md bg-red-600/80 px-2 py-0.5 text-[10px] font-semibold text-white">
                          <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0C.488 3.45.029 5.804 0 12c.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0C23.512 20.55 23.971 18.196 24 12c-.029-6.185-.484-8.549-4.385-8.816zM9 16V8l8 3.993L9 16z"/>
                          </svg>
                          YouTube
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3 space-y-1">
                    <p className="text-sm font-semibold text-white leading-snug line-clamp-2 group-hover:text-white transition-colors">
                      {replay.title}
                    </p>
                    <p className="text-[11px] text-white/35">{formatDate(replay.created_at)}</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="px-4 py-3 border-t border-white/10 flex items-center justify-between">
        <p className="text-xs text-white/20">
          {accessMode === "membership"
            ? `Membership · ${user?.username ?? "member"}`
            : `Tiket · ${liveId}`}
        </p>
      </footer>

      {/* Player modal */}
      {activeReplay && (
        <ReplayPlayerModal
          replay={activeReplay}
          onClose={() => setActiveReplay(null)}
        />
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────
export default function ReplayPage() {
  const params = useParams<{ liveId: string }>()
  const liveId = params?.liveId ?? ""

  // /replay/memb → membership-only direct access
  const isMembRoute  = liveId === "memb"
  const hasTokenInUrl = !!liveId && liveId !== "memb"

  const [verifyState, setVerifyState] = useState<VerifyState>("checking")
  const [tokenInfo,   setTokenInfo]   = useState<LiveTokenInfo | null>(null)
  const [errorMsg,    setErrorMsg]    = useState("")
  const [accessMode,  setAccessMode]  = useState<"token" | "membership">("token")
  const [replays,     setReplays]     = useState<ReplayItem[]>([])
  const [loadingReplays, setLoadingReplays] = useState(false)

  const user     = typeof window !== "undefined" ? getUserFromStorage() : null
  const isMember = isMembershipActive(user?.membership_type, user?.membership_expired_at)

  // ── Fetch replays ───────────────────────────────────────
  const fetchReplays = useCallback(async () => {
    setLoadingReplays(true)
    try {
      const res  = await fetch(`${API_BASE}/replay?limit=50&apikey=${API_KEY}`)
      const data = await res.json()
      if (data.status && Array.isArray(data.data)) setReplays(data.data)
    } catch {}
    finally { setLoadingReplays(false) }
  }, [])

  // ── Fetch token info ────────────────────────────────────
  const fetchTokenInfo = useCallback(async (): Promise<LiveTokenInfo | null> => {
    try {
      const res  = await fetch(`${API_BASE}/live/${liveId}/info?apikey=${API_KEY}`)
      const data = await res.json()
      return data.status && data.data ? data.data : null
    } catch { return null }
  }, [liveId])

  // ── Consume token ───────────────────────────────────────
  const consumeToken = useCallback(async (info: LiveTokenInfo): Promise<boolean> => {
    try {
      const res  = await fetch(`${API_BASE}/live/${liveId}?apikey=${API_KEY}`)
      const data = await res.json()
      if (data.status) {
        writeCachedAccess({
          liveId,
          consumedAt: Date.now(),
          expiresAt:  info.expires_at ? new Date(info.expires_at).getTime() : null,
        })
        return true
      }
      setErrorMsg(data.message || "Token tidak valid")
      return false
    } catch {
      setErrorMsg("Gagal menghubungi server")
      return false
    }
  }, [liveId])

  // ── Core verification flow ──────────────────────────────
  const runVerification = useCallback(async () => {
    setVerifyState("checking")

    // Route: /replay/memb
    if (isMembRoute) {
      const u = getUserFromStorage()
      if (!u || !isMembershipActive(u.membership_type, u.membership_expired_at)) {
        setErrorMsg("Halaman ini hanya untuk member aktif.")
        setVerifyState("denied")
        return
      }
      setAccessMode("membership")
      setVerifyState("membership")
      fetchReplays()
      return
    }

    // Tidak ada token di URL
    if (!hasTokenInUrl) {
      // Cek membership dulu
      const u = getUserFromStorage()
      if (u && isMembershipActive(u.membership_type, u.membership_expired_at)) {
        setAccessMode("membership")
        setVerifyState("membership")
        fetchReplays()
        return
      }
      setErrorMsg("Akses memerlukan live token atau membership aktif.")
      setVerifyState("denied")
      return
    }

    // Ada token di URL

    // 1. Membership bypass
    const u = getUserFromStorage()
    if (u && isMembershipActive(u.membership_type, u.membership_expired_at)) {
      setAccessMode("membership")
      setVerifyState("membership")
      fetchReplays()
      return
    }

    // 2. Cache hit
    const cached = readCachedAccess(liveId)
    if (cached) {
      setAccessMode("token")
      setVerifyState("granted")
      fetchReplays()
      return
    }

    // 3. Fetch & validate token
    const info = await fetchTokenInfo()
    if (!info) {
      setErrorMsg("Token tidak ditemukan.")
      setVerifyState("denied")
      return
    }
    setTokenInfo(info)

    if (!info.is_active) { setErrorMsg("Token dinonaktifkan admin.");              setVerifyState("denied"); return }
    if (info.is_expired)  { setErrorMsg("Token sudah expired.");                    setVerifyState("denied"); return }
    if (info.is_maxed)    { setErrorMsg(`Batas penggunaan token tercapai (${info.max_uses}x).`); setVerifyState("denied"); return }

    // 4. Consume
    setVerifyState("verifying")
    const ok = await consumeToken(info)
    if (ok) {
      setAccessMode("token")
      setVerifyState("granted")
      fetchReplays()
    } else {
      setVerifyState("denied")
    }
  }, [liveId, isMembRoute, hasTokenInUrl, fetchTokenInfo, consumeToken, fetchReplays])

  useEffect(() => { runVerification() }, [runVerification])

  // ── Render ──────────────────────────────────────────────
  const isVerifyScreen =
    verifyState !== "granted" &&
    verifyState !== "membership"

  if (isVerifyScreen) {
    return (
      <VerifyScreen
        state={verifyState}
        tokenInfo={tokenInfo}
        liveId={liveId}
        errorMsg={errorMsg}
        onRetry={runVerification}
      />
    )
  }

  if (loadingReplays) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          <p className="text-sm text-white/50">Memuat replay...</p>
        </div>
      </div>
    )
  }

  return (
    <ReplayGrid
      replays={replays}
      accessMode={accessMode}
      liveId={liveId}
      user={user}
    />
  )
}
