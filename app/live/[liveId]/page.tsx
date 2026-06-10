"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"

// ─── Constants ───────────────────────────────────────────────
const API_BASE   = "https://v5.jkt48connect.com/api/team48"
const IDN_API    = "https://v5.jkt48connect.com/api/jkt48/idnplus?apikey=JKTCONNECT"
const API_KEY    = "JKTCONNECT"
// localStorage key prefix: "t48_live_access_{liveId}"
const LS_PREFIX  = "t48_live_access_"

// ─── Types ───────────────────────────────────────────────────
interface LiveTokenInfo {
  live_id:         string
  show_id:         string | null
  label:           string
  max_uses:        number | null
  uses_count:      number
  uses_remaining:  number | null
  expires_at:      string | null
  is_active:       boolean
  is_expired:      boolean
  is_maxed:        boolean
  is_usable:       boolean
  notes:           string | null
}

interface IdnShow {
  slug:            string
  title:           string
  image_url:       string | null
  status:          string        // "live" | "scheduled" | "ended"
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
  rtmp:    { url: string; label: string } | null
  youtube: { url: string; video_id: string | null; embed_url: string | null; label: string } | null
}

// What we cache in localStorage after a successful consume
interface CachedAccess {
  liveId:    string
  showId:    string | null
  consumedAt: number
  expiresAt:  number | null   // ms epoch
}

type VerifyState =
  | "checking"          // initial — fetching token info
  | "waiting_live"      // show not started yet; token valid but not consumed
  | "verifying"         // consuming token (show started)
  | "granted"           // access OK (fresh consume or cache hit)
  | "denied"            // token invalid / maxed / expired
  | "membership"        // membership bypass
  | "error"             // network error

// ─── Helpers ─────────────────────────────────────────────────

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return m ? decodeURIComponent(m[1]) : null
}

function getAccessToken(): string | null {
  if (typeof window === "undefined") return null
  try {
    const ls = localStorage.getItem("t48_auth")
    if (ls) { const p = JSON.parse(ls); if (p?.access_token) return p.access_token }
  } catch {}
  const raw = getCookie("t48_access_token")
  return raw || null
}

function getUserFromStorage(): { user_id?: string; username?: string; membership_type?: string; membership_expired_at?: string } | null {
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

function getLsKey(liveId: string) { return `${LS_PREFIX}${liveId}` }

function readCachedAccess(liveId: string): CachedAccess | null {
  try {
    const raw = localStorage.getItem(getLsKey(liveId))
    if (!raw) return null
    const data = JSON.parse(raw) as CachedAccess
    // Check if cached access itself has expired
    if (data.expiresAt && Date.now() > data.expiresAt) {
      localStorage.removeItem(getLsKey(liveId))
      return null
    }
    return data
  } catch { return null }
}

function writeCachedAccess(data: CachedAccess) {
  try { localStorage.setItem(getLsKey(data.liveId), JSON.stringify(data)) } catch {}
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

// ─── Countdown hook ───────────────────────────────────────────
function useCountdown(targetTs: number | null) {
  const [diff, setDiff] = useState(0)
  useEffect(() => {
    if (!targetTs) return
    const tick = () => setDiff(Math.max(0, targetTs - Math.floor(Date.now() / 1000)))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [targetTs])
  return {
    diff,
    h: Math.floor(diff / 3600),
    m: Math.floor((diff % 3600) / 60),
    s: diff % 60,
  }
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
  return <video ref={videoRef} className={className} controls autoPlay playsInline muted />
}

// ─── Verify Screen ────────────────────────────────────────────
function VerifyScreen({
  state,
  tokenInfo,
  countdown,
  show,
  liveId,
  errorMsg,
  onRetry,
}: {
  state:     VerifyState
  tokenInfo: LiveTokenInfo | null
  countdown: { diff: number; h: number; m: number; s: number }
  show:      IdnShow | null
  liveId:    string
  errorMsg:  string
  onRetry:   () => void
}) {
  const isScheduled = show?.status === "scheduled" && countdown.diff > 0

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-4">
      <div className="w-full max-w-sm space-y-6 text-center">

        {/* Show info */}
        {show && (
          <div className="space-y-3">
            {show.image_url && (
              <div className="relative mx-auto h-40 w-full max-w-xs overflow-hidden rounded-xl bg-white/5">
                <img
                  src={show.image_url}
                  alt={show.title}
                  className="h-full w-full object-cover opacity-60"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              </div>
            )}
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/40">
                JKT48 Live
              </p>
              <h1 className="text-lg font-bold text-white leading-snug">{show.title}</h1>
              {show.creator && (
                <div className="flex items-center justify-center gap-2">
                  {show.creator.image_url && (
                    <img src={show.creator.image_url} alt={show.creator.name}
                      className="h-5 w-5 rounded-full object-cover" />
                  )}
                  <span className="text-xs text-white/50">{show.creator.name}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* State-specific content */}
        {state === "checking" && (
          <div className="space-y-3">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            <p className="text-sm text-white/50">Memverifikasi akses...</p>
          </div>
        )}

        {state === "verifying" && (
          <div className="space-y-3">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            <p className="text-sm text-white/50">Mengaktifkan tiket...</p>
          </div>
        )}

        {/* Waiting for show to start (token valid, not consumed yet) */}
        {state === "waiting_live" && isScheduled && show && (
          <div className="space-y-5">
            {/* Countdown */}
            <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-5 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
                Siaran Dimulai Dalam
              </p>
              <div className="flex items-center justify-center gap-2">
                {[
                  { val: countdown.h, label: "JAM" },
                  { val: countdown.m, label: "MENIT" },
                  { val: countdown.s, label: "DETIK" },
                ].map((item, i) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <div className="flex flex-col items-center">
                      <span className="font-mono text-4xl font-black text-white tabular-nums"
                        style={{ textShadow: "0 0 24px rgba(255,255,255,0.2)" }}>
                        {pad(item.val)}
                      </span>
                      <span className="mt-1 text-[9px] font-semibold tracking-widest text-white/40">
                        {item.label}
                      </span>
                    </div>
                    {i < 2 && <span className="mb-5 text-2xl font-black text-white/30 animate-pulse">:</span>}
                  </div>
                ))}
              </div>
              {show.scheduled_at && (
                <p className="text-xs text-white/30">{formatSchedule(show.scheduled_at)}</p>
              )}
            </div>

            {/* Token info */}
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left space-y-1.5">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xs font-medium text-green-400">Tiket Kamu Valid</span>
              </div>
              {tokenInfo?.label && (
                <p className="text-xs text-white/50 pl-6">{tokenInfo.label}</p>
              )}
              {tokenInfo?.expires_at && (
                <p className="text-xs text-white/30 pl-6">
                  Berlaku hingga {new Date(tokenInfo.expires_at).toLocaleDateString("id-ID", {
                    day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta",
                  })}
                </p>
              )}
            </div>

            <p className="text-xs text-white/30">
              Halaman ini akan otomatis membuka stream saat show dimulai.
              <br />Tiket akan digunakan saat live berlangsung.
            </p>

            {/* Auto-poll note */}
            <div className="flex items-center justify-center gap-1.5 text-xs text-white/30">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" />
              Menunggu show dimulai...
            </div>
          </div>
        )}

        {/* Waiting but not scheduled (show info loading or status unknown) */}
        {state === "waiting_live" && !isScheduled && (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-1.5 text-xs text-white/30">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" />
              Menunggu show dimulai...
            </div>
            {tokenInfo && (
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left">
                <p className="text-xs text-green-400 font-medium">✓ Tiket valid — {tokenInfo.label}</p>
              </div>
            )}
          </div>
        )}

        {/* Access denied */}
        {state === "denied" && (
          <div className="space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 ring-1 ring-red-500/30">
              <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v4m0 4h.01M10.293 4.293a1 1 0 011.414 0l7 7a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7a1 1 0 010-1.414l7-7z" />
              </svg>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-white">Akses Ditolak</p>
              <p className="text-sm text-white/40">{errorMsg || "Token tidak valid, sudah digunakan, atau expired."}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left space-y-1.5 text-xs text-white/40">
              <p className="font-medium text-white/60">Token Info</p>
              <p className="font-mono break-all">{liveId}</p>
              {tokenInfo && (
                <>
                  {tokenInfo.is_expired && <p className="text-red-400">⚠ Token sudah expired</p>}
                  {tokenInfo.is_maxed  && <p className="text-red-400">⚠ Token sudah mencapai batas penggunaan ({tokenInfo.max_uses}x)</p>}
                  {!tokenInfo.is_active && <p className="text-red-400">⚠ Token dinonaktifkan oleh admin</p>}
                </>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {state === "error" && (
          <div className="space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yellow-500/10 ring-1 ring-yellow-500/30">
              <svg className="h-8 w-8 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-white">Terjadi Kesalahan</p>
              <p className="text-sm text-white/40">{errorMsg || "Gagal memverifikasi token. Periksa koneksi internet kamu."}</p>
            </div>
            <button
              onClick={onRetry}
              className="w-full rounded-xl bg-white/10 py-2.5 text-sm font-medium text-white hover:bg-white/15 transition-colors"
            >
              Coba Lagi
            </button>
          </div>
        )}

      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────
export default function LiveTokenPage() {
  const params   = useParams<{ liveId: string }>()
  const liveId   = params?.liveId ?? ""

  const [verifyState, setVerifyState] = useState<VerifyState>("checking")
  const [tokenInfo,   setTokenInfo]   = useState<LiveTokenInfo | null>(null)
  const [show,        setShow]        = useState<IdnShow | null>(null)
  const [streamData,  setStreamData]  = useState<StreamData | null>(null)
  const [activeSource, setActiveSource] = useState<"rtmp" | "youtube">("rtmp")
  const [errorMsg,    setErrorMsg]    = useState("")

  const pollingRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const consumedRef = useRef(false)

  // Countdown for scheduled shows
  const countdown = useCountdown(
    show?.status === "scheduled" ? (show.scheduled_at ?? null) : null
  )

  // ── Fetch show data from IDN API ─────────────────────────
  const fetchShow = useCallback(async (showId: string): Promise<IdnShow | null> => {
    try {
      const res  = await fetch(IDN_API)
      const data = await res.json()
      if (Array.isArray(data.data)) {
        return data.data.find((s: IdnShow) => s.showId === showId) ?? null
      }
    } catch {}
    return null
  }, [])

  // ── Fetch stream sources ─────────────────────────────────
  const fetchStream = useCallback(async (showId: string) => {
    try {
      const res  = await fetch(`${API_BASE}/stream/${showId}?apikey=${API_KEY}`)
      const data = await res.json()
      if (data.status && data.data) {
        setStreamData(data.data)
        if (data.sources?.length) setActiveSource(data.sources[0].type)
      }
    } catch {}
  }, [])

  // ── Consume token (increment uses_count) ────────────────
  const consumeToken = useCallback(async (): Promise<boolean> => {
    try {
      const res  = await fetch(`${API_BASE}/live/${liveId}?apikey=${API_KEY}`)
      const data = await res.json()
      if (data.status) {
        // Cache in localStorage
        const expiresAtMs = tokenInfo?.expires_at
          ? new Date(tokenInfo.expires_at).getTime()
          : null
        writeCachedAccess({
          liveId,
          showId:     tokenInfo?.show_id ?? null,
          consumedAt: Date.now(),
          expiresAt:  expiresAtMs,
        })
        return true
      }
      setErrorMsg(data.message || "Token tidak valid")
      return false
    } catch {
      setErrorMsg("Gagal menghubungi server. Periksa koneksi internet.")
      return false
    }
  }, [liveId, tokenInfo])

  // ── Check token info WITHOUT consuming ──────────────────
  const fetchTokenInfo = useCallback(async (): Promise<LiveTokenInfo | null> => {
    try {
      const res  = await fetch(`${API_BASE}/live/${liveId}/info?apikey=${API_KEY}`)
      const data = await res.json()
      if (data.status && data.data) return data.data as LiveTokenInfo
      return null
    } catch { return null }
  }, [liveId])

  // ── Core verification flow ───────────────────────────────
  const runVerification = useCallback(async () => {
    if (!liveId) { setErrorMsg("Token tidak valid"); setVerifyState("denied"); return }
    setVerifyState("checking")
    consumedRef.current = false

    // 1. Check localStorage cache first
    const cached = readCachedAccess(liveId)
    if (cached) {
      // Already consumed before and not expired — go straight to granted
      setVerifyState("granted")
      // Still try to fetch show & stream in background
      if (cached.showId) {
        fetchShow(cached.showId).then(s => { if (s) { setShow(s); fetchStream(s.showId) } })
      }
      return
    }

    // 2. Check membership bypass
    const user = getUserFromStorage()
    if (user && isMembershipActive(user.membership_type, user.membership_expired_at)) {
      // Member — bypass token entirely
      setVerifyState("membership")
      // Fetch token info to get showId, then load show
      const info = await fetchTokenInfo()
      if (info) {
        setTokenInfo(info)
        if (info.show_id) {
          const s = await fetchShow(info.show_id)
          if (s) { setShow(s); fetchStream(s.showId) }
        }
      }
      return
    }

    // 3. Fetch token info (no consume yet)
    const info = await fetchTokenInfo()
    if (!info) {
      setErrorMsg("Token tidak ditemukan")
      setVerifyState("denied")
      return
    }
    setTokenInfo(info)

    if (!info.is_active) {
      setErrorMsg("Token sudah dinonaktifkan oleh admin")
      setVerifyState("denied"); return
    }
    if (info.is_expired) {
      setErrorMsg("Token sudah expired")
      setVerifyState("denied"); return
    }
    if (info.is_maxed) {
      setErrorMsg(`Token sudah mencapai batas penggunaan (${info.max_uses}x)`)
      setVerifyState("denied"); return
    }

    // 4. Fetch show to check status
    let currentShow: IdnShow | null = null
    if (info.show_id) {
      currentShow = await fetchShow(info.show_id)
      if (currentShow) setShow(currentShow)
    }

    const isLive = currentShow?.status === "live"
    const isScheduled = currentShow?.status === "scheduled"

    if (isLive) {
      // Show is live — consume token now
      setVerifyState("verifying")
      const ok = await consumeToken()
      if (ok) {
        consumedRef.current = true
        setVerifyState("granted")
        if (currentShow) fetchStream(currentShow.showId)
      } else {
        setVerifyState("denied")
      }
      return
    }

    if (isScheduled || !currentShow) {
      // Show not started yet — park in waiting state, don't consume
      setVerifyState("waiting_live")
      return
    }

    // Show ended — still let them watch (replay) but consume token
    setVerifyState("verifying")
    const ok = await consumeToken()
    if (ok) {
      consumedRef.current = true
      setVerifyState("granted")
      if (currentShow) fetchStream(currentShow.showId)
    } else {
      setVerifyState("denied")
    }
  }, [liveId, fetchTokenInfo, fetchShow, fetchStream, consumeToken])

  // ── Initial run ──────────────────────────────────────────
  useEffect(() => {
    if (liveId) runVerification()
  }, [liveId, runVerification])

  // ── Poll while waiting for show to start ────────────────
  useEffect(() => {
    if (verifyState !== "waiting_live") {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
      return
    }
    if (pollingRef.current) return // already polling

    pollingRef.current = setInterval(async () => {
      if (!tokenInfo?.show_id) return
      const currentShow = await fetchShow(tokenInfo.show_id)
      if (!currentShow) return
      setShow(currentShow)

      if (currentShow.status === "live") {
        clearInterval(pollingRef.current!)
        pollingRef.current = null
        // Now consume the token
        setVerifyState("verifying")
        const ok = await consumeToken()
        if (ok) {
          consumedRef.current = true
          setVerifyState("granted")
          fetchStream(currentShow.showId)
        } else {
          setVerifyState("denied")
        }
      }
    }, 15000) // Poll every 15 seconds

    return () => {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
    }
  }, [verifyState, tokenInfo, fetchShow, consumeToken, fetchStream])

  // ── Resolve stream URL ───────────────────────────────────
  const activeStreamUrl = (() => {
    if (!streamData) return null
    if (activeSource === "rtmp" && streamData.rtmp?.url) return streamData.rtmp.url
    return null
  })()

  const activeYoutubeEmbedUrl = (() => {
    if (!streamData) return null
    if (activeSource === "youtube" && streamData.youtube?.embed_url) return streamData.youtube.embed_url
    return null
  })()

  const fallbackUrl = show?.playback_url ?? null
  const isLive      = show?.status === "live"
  const isEnded     = show?.status === "ended"
  const isScheduled = show?.status === "scheduled"
  const showCountdown = isScheduled && countdown.diff > 0

  // ── Show verify screen for non-granted states ────────────
  if (verifyState !== "granted" && verifyState !== "membership") {
    return (
      <VerifyScreen
        state={verifyState}
        tokenInfo={tokenInfo}
        countdown={countdown}
        show={show}
        liveId={liveId}
        errorMsg={errorMsg}
        onRetry={runVerification}
      />
    )
  }

  // ─────────────────────────────────────────────────────────
  // ── GRANTED / MEMBERSHIP — Render Player ────────────────
  // ─────────────────────────────────────────────────────────

  const user = typeof window !== "undefined" ? getUserFromStorage() : null
  const isMember = isMembershipActive(user?.membership_type, user?.membership_expired_at)

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">

      {/* ── Top Bar ─────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {show ? (
            <>
              {show.creator.image_url && (
                <img src={show.creator.image_url} alt={show.creator.name}
                  className="h-7 w-7 rounded-full object-cover shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{show.title}</p>
                <p className="text-xs text-white/40 truncate">@{show.creator.username}</p>
              </div>
            </>
          ) : (
            <p className="text-sm font-medium text-white/60">JKT48 Live</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Access badge */}
          {isMember ? (
            <span className="flex items-center gap-1 rounded-full bg-blue-500/20 px-2.5 py-1 text-xs font-medium text-blue-300">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
              Member
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-2.5 py-1 text-xs font-medium text-green-300">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
              </svg>
              Tiket Aktif
            </span>
          )}

          {isLive && (
            <div className="flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-ping absolute" />
              <span className="h-1.5 w-1.5 rounded-full bg-white relative" />
              LIVE
            </div>
          )}
        </div>
      </header>

      {/* ── Player Area ──────────────────────────────────────── */}
      <div className="relative w-full bg-black shrink-0" style={{ aspectRatio: "16/9", maxHeight: "calc(100vh - 120px)" }}>

        {/* Background thumbnail */}
        {show?.image_url && (
          <img src={show.image_url} alt={show.title}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity ${
              isLive && (streamData || fallbackUrl) ? "opacity-0" : "opacity-60"
            }`}
          />
        )}

        {/* YouTube embed */}
        {isLive && activeYoutubeEmbedUrl && (
          <iframe src={activeYoutubeEmbedUrl}
            className="absolute inset-0 h-full w-full"
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen />
        )}

        {/* HLS Player */}
        {isLive && activeStreamUrl && !activeYoutubeEmbedUrl && (
          <HlsPlayer src={activeStreamUrl}
            className="absolute inset-0 h-full w-full object-contain bg-black" />
        )}

        {/* Fallback IDN playback */}
        {isLive && !streamData && fallbackUrl && (
          <HlsPlayer src={fallbackUrl}
            className="absolute inset-0 h-full w-full object-contain bg-black" />
        )}

        {/* Countdown overlay (show scheduled) */}
        {showCountdown && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
            <p className="mb-4 text-xs font-semibold tracking-[0.2em] text-white/70 uppercase">
              Siaran Dimulai Dalam
            </p>
            <div className="flex items-center gap-3">
              {[
                { val: countdown.h, label: "JAM" },
                { val: countdown.m, label: "MENIT" },
                { val: countdown.s, label: "DETIK" },
              ].map((item, i) => (
                <div key={item.label} className="flex items-center gap-3">
                  <div className="flex flex-col items-center">
                    <span className="font-mono text-5xl font-black tracking-tight text-white tabular-nums"
                      style={{ textShadow: "0 0 30px rgba(255,255,255,0.3)" }}>
                      {pad(item.val)}
                    </span>
                    <span className="mt-1 text-[10px] font-semibold tracking-widest text-white/50">
                      {item.label}
                    </span>
                  </div>
                  {i < 2 && <span className="mb-5 text-3xl font-black text-white/40 animate-pulse">:</span>}
                </div>
              ))}
            </div>
            {show?.scheduled_at && (
              <p className="mt-4 text-xs text-white/30">{formatSchedule(show.scheduled_at)}</p>
            )}
          </div>
        )}

        {/* Ended overlay */}
        {isEnded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
            <svg className="h-10 w-10 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.362a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
            <p className="mt-3 text-sm font-medium text-white/50">Show telah selesai</p>
          </div>
        )}

        {/* Source switcher */}
        {isLive && streamData?.sources && streamData.sources.length > 1 && (
          <div className="absolute bottom-3 right-3 flex gap-2">
            {streamData.sources.map(s => (
              <button key={s.type} onClick={() => setActiveSource(s.type as "rtmp" | "youtube")}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeSource === s.type
                    ? "bg-white text-black"
                    : "bg-white/10 text-white/70 hover:bg-white/20"
                }`}>
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Show Info ─────────────────────────────────────────── */}
      {show && (
        <div className="px-4 py-4 space-y-3 border-b border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5 min-w-0">
              <h1 className="text-base font-semibold leading-snug">{show.title}</h1>
              <div className="flex items-center gap-2 flex-wrap">
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
                {show.idnliveplus?.liveroom_price != null && (
                  <span className="rounded-full bg-yellow-500/20 px-2.5 py-0.5 text-xs font-medium text-yellow-400">
                    {show.idnliveplus.liveroom_price} gold
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {show.creator.image_url && (
                <img src={show.creator.image_url} alt={show.creator.name}
                  className="h-9 w-9 rounded-full object-cover ring-1 ring-white/20" />
              )}
              <div className="hidden sm:block">
                <p className="text-sm font-semibold">{show.creator.name}</p>
                <p className="text-xs text-white/40">@{show.creator.username}</p>
              </div>
            </div>
          </div>

          {isScheduled && show.scheduled_at && (
            <div className="flex items-center gap-2 text-xs text-white/50">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {formatSchedule(show.scheduled_at)}
            </div>
          )}

          {show.idnliveplus?.description && (
            <p className="text-xs text-white/50 leading-relaxed whitespace-pre-line line-clamp-3">
              {show.idnliveplus.description.trim()}
            </p>
          )}

          {/* No stream warning */}
          {isLive && !streamData && !fallbackUrl && (
            <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-xs text-yellow-400">
              Stream belum tersedia. Admin perlu mengatur sumber stream untuk show ini.
            </div>
          )}
        </div>
      )}

      {/* ── Access Info Footer ───────────────────────────────── */}
      <div className="px-4 py-3 mt-auto">
        <div className="flex items-center gap-2 text-xs text-white/20">
          <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          {isMember
            ? `Akses via membership · ${user?.username ?? "member"}`
            : `Akses via tiket · ${liveId}`
          }
        </div>
      </div>

    </div>
  )
}
