"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useParams } from "next/navigation"

// ─── Constants ────────────────────────────────────────────────
const API_BASE  = "https://v5.jkt48connect.com/api/team48"
const API_KEY   = "JKTCONNECT"
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
  | "input"       // user belum input token
  | "checking"    // cek membership / cache
  | "verifying"   // consume token ke API
  | "granted"     // akses token berhasil
  | "membership"  // akses via membership
  | "denied"      // ditolak
  | "error"       // error jaringan

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

function extractYoutubeId(urlOrId: string | null): string | null {
  if (!urlOrId) return null
  if (/^[a-zA-Z0-9_-]{11}$/.test(urlOrId)) return urlOrId
  const m = urlOrId.match(/(?:youtube\.com\/(?:watch\?v=|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta",
  })
}

// ─── Plyr YouTube Player ──────────────────────────────────────
function PlyrYoutubePlayer({ videoId, className }: { videoId: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const plyrRef      = useRef<any>(null)

  useEffect(() => {
    if (!videoId || !containerRef.current) return

    const existingLink = document.getElementById("plyr-css")
    if (!existingLink) {
      const link = document.createElement("link")
      link.id   = "plyr-css"
      link.rel  = "stylesheet"
      link.href = "https://cdn.plyr.io/3.7.8/plyr.css"
      document.head.appendChild(link)
    }

    const existingStyle = document.getElementById("plyr-custom-css")
    if (!existingStyle) {
      const style = document.createElement("style")
      style.id = "plyr-custom-css"
      style.textContent = `
        .plyr--youtube .plyr__poster { background-size: cover; }
        .plyr__control--overlaid {
          background: rgba(255,255,255,0.15) !important;
          border: 1px solid rgba(255,255,255,0.2) !important;
          backdrop-filter: blur(8px) !important;
        }
        .plyr__control--overlaid:hover { background: rgba(255,255,255,0.25) !important; }
        .plyr--full-ui input[type=range] { color: #fff !important; }
        .plyr__progress input[type=range]::-webkit-slider-thumb { background: #fff !important; }
        .plyr__volume input[type=range] { color: #fff !important; }
        .plyr__controls {
          background: linear-gradient(transparent, rgba(0,0,0,0.7)) !important;
          padding: 20px 10px 10px !important;
        }
        .plyr__video-wrapper iframe { pointer-events: none !important; }
        .plyr__video-wrapper { position: relative; }
        .plyr__video-wrapper::before {
          content: '';
          position: absolute;
          top: 0; left: 0;
          width: 200px; height: 56px;
          background: #000;
          z-index: 2;
          pointer-events: none;
        }
        .plyr__video-wrapper::after {
          content: '';
          position: absolute;
          top: 0; right: 0;
          width: 140px; height: 56px;
          background: #000;
          z-index: 2;
          pointer-events: none;
        }
      `
      document.head.appendChild(style)
    }

    let destroyed = false

    const loadPlyr = async () => {
      // @ts-ignore
      if (window.Plyr) { initPlyr(); return }
      const script = document.createElement("script")
      script.src   = "https://cdn.plyr.io/3.7.8/plyr.polyfilled.js"
      script.onload = () => { if (!destroyed) initPlyr() }
      document.head.appendChild(script)
    }

    const initPlyr = () => {
      if (!containerRef.current || destroyed) return
      const wrapper = containerRef.current
      wrapper.innerHTML = `<div class="plyr__video-embed" id="plyr-target">
        <iframe
          src="https://www.youtube-nocookie.com/embed/${videoId}?origin=${encodeURIComponent(window.location.origin)}&iv_load_policy=3&modestbranding=1&playsinline=1&showinfo=0&rel=0&enablejsapi=1"
          allowfullscreen allowtransparency allow="autoplay" style="border:none"
        ></iframe>
      </div>`
      // @ts-ignore
      plyrRef.current = new window.Plyr("#plyr-target", {
        autoplay: true,
        youtube: { noCookie: true, rel: 0, showinfo: 0, iv_load_policy: 3, modestbranding: 1, origin: window.location.origin },
        controls: ["play-large","play","progress","current-time","duration","mute","volume","captions","settings","fullscreen"],
        settings: ["quality","speed"],
        hideControls: false,
        resetOnEnd: false,
        disableContextMenu: true,
        poster: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      })
    }

    loadPlyr()
    return () => {
      destroyed = true
      try { plyrRef.current?.destroy() } catch {}
      if (containerRef.current) containerRef.current.innerHTML = ""
    }
  }, [videoId])

  return <div ref={containerRef} className={className} style={{ width: "100%", height: "100%" }} />
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

// ─── Token Input Screen ───────────────────────────────────────
function TokenInputScreen({
  isMembRoute,
  onSubmit,
  onUseMembership,
  hasMembership,
}: {
  isMembRoute:    boolean
  onSubmit:       (token: string) => void
  onUseMembership: () => void
  hasMembership:  boolean
}) {
  const [value, setValue] = useState("")
  const [err,   setErr]   = useState("")

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed) { setErr("Masukkan token terlebih dahulu"); return }
    setErr("")
    onSubmit(trimmed)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Header */}
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10">
            <svg className="h-7 w-7 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.362a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/30">JKT48 Replay</p>
          <p className="text-base font-semibold text-white">Masukkan Token Tiket</p>
          <p className="text-sm text-white/40">
            Masukkan token tiket yang kamu miliki untuk mengakses replay show.
          </p>
        </div>

        {/* Input */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-white/50">Token Tiket</label>
            <input
              type="text"
              value={value}
              onChange={e => { setValue(e.target.value); setErr("") }}
              onKeyDown={e => { if (e.key === "Enter") handleSubmit() }}
              placeholder="Contoh: T48-XXXXXXXX"
              spellCheck={false}
              autoComplete="off"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-white placeholder-white/20 outline-none focus:border-white/25 focus:bg-white/8 transition-colors"
            />
            {err && <p className="text-xs text-red-400">{err}</p>}
          </div>

          <button
            onClick={handleSubmit}
            className="w-full rounded-xl bg-white py-3 text-sm font-semibold text-black hover:bg-white/90 active:bg-white/80 transition-colors"
          >
            Akses Replay
          </button>
        </div>

        {/* Divider */}
        {hasMembership && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-white/10" />
              <span className="text-xs text-white/25">atau</span>
              <div className="flex-1 border-t border-white/10" />
            </div>
            <button
              onClick={onUseMembership}
              className="w-full rounded-xl border border-blue-500/30 bg-blue-500/10 py-3 text-sm font-medium text-blue-300 hover:bg-blue-500/15 transition-colors"
            >
              Lanjutkan dengan Membership
            </button>
          </div>
        )}

        {/* Info */}
        <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-3 space-y-1 text-xs text-white/30">
          <p className="text-white/50 font-medium">Cara mendapatkan token:</p>
          <p>· Beli tiket show di halaman <span className="text-white/50">Membership</span></p>
          <p>· Token akan muncul di riwayat pembelian kamu</p>
        </div>

      </div>
    </div>
  )
}

// ─── Verify / Loading / Denied Screen ────────────────────────
function StatusScreen({
  state,
  tokenInfo,
  tokenInput,
  errorMsg,
  onRetry,
  onBack,
}: {
  state:      VerifyState
  tokenInfo:  LiveTokenInfo | null
  tokenInput: string
  errorMsg:   string
  onRetry:    () => void
  onBack:     () => void
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-4">
      <div className="w-full max-w-sm space-y-6 text-center">

        <div className="space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10">
            <svg className="h-7 w-7 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.362a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/30">JKT48 Replay</p>
        </div>

        {(state === "checking" || state === "verifying") && (
          <div className="space-y-3">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            <p className="text-sm text-white/50">
              {state === "checking" ? "Memverifikasi akses..." : "Mengaktifkan tiket..."}
            </p>
          </div>
        )}

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
              <p className="text-sm text-white/40">{errorMsg || "Token tidak valid, sudah digunakan, atau expired."}</p>
            </div>
            {tokenInfo && (
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left space-y-1 text-xs text-white/40">
                <p className="font-mono break-all">{tokenInput}</p>
                {tokenInfo.is_expired && <p className="text-red-400">⚠ Token sudah expired</p>}
                {tokenInfo.is_maxed   && <p className="text-red-400">⚠ Batas penggunaan tercapai ({tokenInfo.max_uses}x)</p>}
                {!tokenInfo.is_active && <p className="text-red-400">⚠ Token dinonaktifkan admin</p>}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={onBack}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-medium text-white/60 hover:bg-white/10 transition-colors">
                Ganti Token
              </button>
              <button onClick={onRetry}
                className="flex-1 rounded-xl bg-white/10 py-2.5 text-sm font-medium text-white hover:bg-white/15 transition-colors">
                Coba Lagi
              </button>
            </div>
          </div>
        )}

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
            <div className="flex gap-2">
              <button onClick={onBack}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-medium text-white/60 hover:bg-white/10 transition-colors">
                Ganti Token
              </button>
              <button onClick={onRetry}
                className="flex-1 rounded-xl bg-white/10 py-2.5 text-sm font-medium text-white hover:bg-white/15 transition-colors">
                Coba Lagi
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ─── Replay Player View ───────────────────────────────────────
function ReplayPlayerView({
  replay,
  accessMode,
  tokenInput,
  user,
  onBack,
}: {
  replay:     ReplayItem
  accessMode: "token" | "membership"
  tokenInput: string
  user:       { username?: string } | null
  onBack:     () => void
}) {
  const youtubeId = extractYoutubeId(replay.youtube_url)
  const hasHls    = !!replay.rtmp_url && !youtubeId

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onBack() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onBack])

  return (
    <div className="h-screen bg-[#0a0a0a] text-white flex flex-col overflow-hidden">
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBack}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/8 text-white/60 hover:bg-white/15 hover:text-white transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 leading-none mb-0.5">Replay</p>
            <p className="text-sm font-semibold truncate leading-snug">{replay.title}</p>
          </div>
        </div>
        <div className="shrink-0">
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
      </header>

      <div className="flex-1 flex flex-col justify-start bg-black overflow-hidden">
        <div className="relative w-full bg-black overflow-hidden"
          style={{
            aspectRatio: "16/9",
            maxHeight:   "calc(100vh - 120px)",
            maxWidth:    "calc((100vh - 120px) * 16 / 9)",
            margin:      "0 auto",
            width:       "100%",
          }}
        >
          {youtubeId ? (
            <div className="absolute inset-0">
              <PlyrYoutubePlayer videoId={youtubeId} className="absolute inset-0 h-full w-full" />
            </div>
          ) : hasHls ? (
            <HlsPlayer src={replay.rtmp_url!} className="absolute inset-0 h-full w-full object-contain bg-black" />
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
      </div>

      <div className="px-4 py-3 border-t border-white/10 shrink-0 space-y-0.5">
        <h1 className="text-sm font-semibold leading-snug">{replay.title}</h1>
        <p className="text-xs text-white/35">{formatDate(replay.created_at)}</p>
        <p className="text-xs text-white/20 pt-1">
          {accessMode === "membership"
            ? `Akses via membership · ${user?.username ?? "member"}`
            : `Akses via tiket · ${tokenInput}`}
        </p>
      </div>
    </div>
  )
}

// ─── Replay Grid ──────────────────────────────────────────────
function ReplayGrid({
  replays,
  accessMode,
  tokenInput,
  user,
}: {
  replays:    ReplayItem[]
  accessMode: "token" | "membership"
  tokenInput: string
  user:       { username?: string } | null
}) {
  const [activeReplay, setActiveReplay] = useState<ReplayItem | null>(null)
  const [search,       setSearch]       = useState("")

  if (activeReplay) {
    return (
      <ReplayPlayerView
        replay={activeReplay}
        accessMode={accessMode}
        tokenInput={tokenInput}
        user={user}
        onBack={() => setActiveReplay(null)}
      />
    )
  }

  const filtered = replays.filter(r =>
    r.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
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
                  <div className="relative aspect-video w-full overflow-hidden bg-white/5">
                    {replay.thumbnail_url ? (
                      <img src={replay.thumbnail_url} alt={replay.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="h-8 w-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.362a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                        </svg>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    {hasVideo && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg">
                          <svg className="h-5 w-5 translate-x-0.5 text-black" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    )}
                    {!hasVideo && (
                      <div className="absolute bottom-2 left-2">
                        <span className="rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/40">
                          Tidak tersedia
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-3 space-y-1">
                    <p className="text-sm font-semibold text-white leading-snug line-clamp-2">{replay.title}</p>
                    <p className="text-[11px] text-white/35">{formatDate(replay.created_at)}</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </main>

      <footer className="px-4 py-3 border-t border-white/10">
        <p className="text-xs text-white/20">
          {accessMode === "membership"
            ? `Membership · ${user?.username ?? "member"}`
            : `Tiket · ${tokenInput}`}
        </p>
      </footer>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────
export default function ReplayPage() {
  const params = useParams<{ liveId: string }>()
  const liveId = params?.liveId ?? ""

  // liveId dari URL hanya dipakai untuk route /replay/memb
  const isMembRoute = liveId === "memb"

  const [verifyState,    setVerifyState]    = useState<VerifyState>("checking")
  const [tokenInput,     setTokenInput]     = useState("")        // token yang user ketik
  const [tokenInfo,      setTokenInfo]      = useState<LiveTokenInfo | null>(null)
  const [errorMsg,       setErrorMsg]       = useState("")
  const [accessMode,     setAccessMode]     = useState<"token" | "membership">("token")
  const [replays,        setReplays]        = useState<ReplayItem[]>([])
  const [loadingReplays, setLoadingReplays] = useState(false)

  const user = typeof window !== "undefined" ? getUserFromStorage() : null
  const hasMembership = !!(user && isMembershipActive(user.membership_type, user.membership_expired_at))

  const fetchReplays = useCallback(async () => {
    setLoadingReplays(true)
    try {
      const res  = await fetch(`${API_BASE}/replay?limit=50&apikey=${API_KEY}`)
      const data = await res.json()
      if (data.status && Array.isArray(data.data)) setReplays(data.data)
    } catch {}
    finally { setLoadingReplays(false) }
  }, [])

  const fetchTokenInfo = useCallback(async (token: string): Promise<LiveTokenInfo | null> => {
    try {
      const res  = await fetch(`${API_BASE}/live/${token}/info?apikey=${API_KEY}`)
      const data = await res.json()
      return data.status && data.data ? data.data : null
    } catch { return null }
  }, [])

  const consumeToken = useCallback(async (token: string, info: LiveTokenInfo): Promise<boolean> => {
    try {
      const res  = await fetch(`${API_BASE}/live/${token}?apikey=${API_KEY}`)
      const data = await res.json()
      if (data.status) {
        writeCachedAccess({
          liveId:     token,
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
  }, [])

  // Jalankan verifikasi membership saat mount (untuk /replay/memb atau user dengan membership)
  useEffect(() => {
    if (isMembRoute) {
      if (!hasMembership) {
        setErrorMsg("Halaman ini hanya untuk member aktif.")
        setVerifyState("denied")
        return
      }
      setAccessMode("membership")
      setVerifyState("membership")
      fetchReplays()
      return
    }

    // Untuk route /replay/show atau /replay/[token-lain]:
    // Cek membership dulu — jika aktif, langsung masuk
    if (hasMembership) {
      setAccessMode("membership")
      setVerifyState("membership")
      fetchReplays()
      return
    }

    // Tidak ada membership → tampilkan form input token
    setVerifyState("input")
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Dipanggil saat user klik "Akses Replay" di form
  const handleTokenSubmit = useCallback(async (token: string) => {
    setTokenInput(token)
    setTokenInfo(null)
    setErrorMsg("")

    // Cek cache dulu
    const cached = readCachedAccess(token)
    if (cached) {
      setAccessMode("token")
      setVerifyState("granted")
      fetchReplays()
      return
    }

    setVerifyState("checking")
    const info = await fetchTokenInfo(token)
    if (!info) {
      setErrorMsg("Token tidak ditemukan.")
      setVerifyState("denied")
      return
    }
    setTokenInfo(info)

    if (!info.is_active) { setErrorMsg("Token dinonaktifkan admin.");                           setVerifyState("denied"); return }
    if (info.is_expired)  { setErrorMsg("Token sudah expired.");                                 setVerifyState("denied"); return }
    if (info.is_maxed)    { setErrorMsg(`Batas penggunaan token tercapai (${info.max_uses}x).`); setVerifyState("denied"); return }

    setVerifyState("verifying")
    const ok = await consumeToken(token, info)
    if (ok) {
      setAccessMode("token")
      setVerifyState("granted")
      fetchReplays()
    } else {
      setVerifyState("denied")
    }
  }, [fetchTokenInfo, consumeToken, fetchReplays])

  // Dipanggil dari StatusScreen tombol "Ganti Token"
  const handleBackToInput = useCallback(() => {
    setVerifyState("input")
    setTokenInfo(null)
    setErrorMsg("")
  }, [])

  // Dipanggil dari StatusScreen tombol "Coba Lagi"
  const handleRetry = useCallback(() => {
    if (tokenInput) handleTokenSubmit(tokenInput)
    else setVerifyState("input")
  }, [tokenInput, handleTokenSubmit])

  // Dipanggil dari TokenInputScreen tombol "Lanjutkan dengan Membership"
  const handleUseMembership = useCallback(() => {
    setAccessMode("membership")
    setVerifyState("membership")
    fetchReplays()
  }, [fetchReplays])

  // ── Render ────────────────────────────────────────────────
  if (verifyState === "input") {
    return (
      <TokenInputScreen
        isMembRoute={isMembRoute}
        onSubmit={handleTokenSubmit}
        onUseMembership={handleUseMembership}
        hasMembership={hasMembership}
      />
    )
  }

  if (verifyState === "checking" || verifyState === "verifying" || verifyState === "denied" || verifyState === "error") {
    return (
      <StatusScreen
        state={verifyState}
        tokenInfo={tokenInfo}
        tokenInput={tokenInput}
        errorMsg={errorMsg}
        onRetry={handleRetry}
        onBack={handleBackToInput}
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
      tokenInput={tokenInput}
      user={user}
    />
  )
}
