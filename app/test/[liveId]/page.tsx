"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useParams } from "next/navigation"
import { createClient } from "@supabase/supabase-js"

// ─── Constants ───────────────────────────────────────────────
const API_BASE  = "https://v5.jkt48connect.com/api/team48"
const IDN_API   = "https://v5.jkt48connect.com/api/jkt48/idnplus?apikey=JKTCONNECT"
const API_KEY   = "JKTCONNECT"
const LS_PREFIX = "t48_live_access_"

const EMAIL_ACCESS_KEY    = "t48_email_access"
const EMAIL_ACCESS_TTL_MS = 7 * 60 * 60 * 1000

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mzxfuaoihgzxvokwarao.supabase.co"
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16eGZ1YW9paGd6eHZva3dhcmFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDg0NjIsImV4cCI6MjA4OTk4NDQ2Mn0.OFYCkBFXCSfLn-wG94OHHKL5CX8T_BLrbDGPiBdPIog"
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── GiStream / CTV constants ─────────────────────────────────
const PARTNER_KID    = "jkt48connect-v1"
const PARTNER_SECRET = "gstream@jkt48connect@2108"
const TOKEN_API_BASE = "https://v5.jkt48connect.com"
const CTV_BASE       = "https://ctv.jkt48connect.com"
const SIGNING_PATH   = "/api/token/generate?apikey=JKTCONNECT"

// ─── v1 stream base (IDN2) ────────────────────────────────────
const V1_STREAM_BASE = "https://v1.jkt48connect.com"

// ─── Theater lineup constants ──────────────────────────────────
const THEATER_API_BASE = "https://v5.jkt48connect.com/api/jkt48/theater"

// ─── Slug thumbnail overrides ─────────────────────────────────
const SLUG_THUMBNAIL_OVERRIDES: { pattern: string; image: string }[] = [
  {
    pattern: "request-hour",
    image:   "https://files.catbox.moe/l5azzz.jpg",
  },
]

function getSlugThumbnail(slug: string | null | undefined): string | null {
  if (!slug) return null
  const lower = slug.toLowerCase()
  for (const entry of SLUG_THUMBNAIL_OVERRIDES) {
    if (lower.includes(entry.pattern.toLowerCase())) return entry.image
  }
  return null
}

function applyThumbnailOverride(show: IdnShow): IdnShow {
  const override = getSlugThumbnail(show.slug)
  if (!override) return show
  return { ...show, image_url: override }
}

// ─── Types ───────────────────────────────────────────────────
interface LiveTokenInfo {
  live_id:        string
  show_id:        string | null
  label:          string
  max_uses:       number | string | null
  uses_count:     number | string
  uses_remaining: number | null
  expires_at:     string | null
  is_active:      boolean
  is_expired:     boolean
  is_maxed:       boolean
  is_usable:      boolean
  notes:          string | null
}

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

interface StreamData {
  source_type: string
  sources: { type: string; label: string; url: string; video_id?: string | null; embed_url?: string | null; is_active: boolean }[]
  rtmp:    { url: string; label: string } | null
  youtube: { url: string; video_id: string | null; embed_url: string | null; label: string } | null
}

interface CachedAccess {
  liveId:     string
  showId:     string | null
  consumedAt: number
  expiresAt:  number | null
}

interface CachedEmailAccess {
  email:     string
  showId:    string | null
  grantedAt: number
  expiresAt: number
}

// ─── Server / source types ────────────────────────────────────
type ServerType = "idn" | "idn2" | "rtmp" | "youtube"

interface IdnStreamData {
  url:       string
  token:     string
  qualities: IdnQuality[]
}

interface IdnQuality {
  index:           number
  name:            string
  quality:         string
  bandwidth:       number
  bandwidth_label: string
  resolution:      string
  fps:             string
  manual_url:      string
}

// ─── IDN2 (v1) stream data ────────────────────────────────────
interface Idn2Quality {
  index:           number
  name:            string
  bandwidth:       number
  bandwidth_label: string
  resolution:      string
  fps:             string
  url:             string
}

interface Idn2StreamData {
  url:       string   // best/auto URL (first in list)
  token:     string
  qualities: Idn2Quality[]
}

// ─── Chat types ──────────────────────────────────────────────
interface ChatMessage {
  id:          string
  user_id:     string
  username:    string
  avatar_url:  string
  full_name:   string
  role:        string
  text:        string
  timestamp:   string
}

interface ChatUser {
  user_id:    string
  username:   string
  full_name:  string
  avatar:     string | null
  role:       string
}

// ─── Theater lineup types ──────────────────────────────────────
interface TheaterLineupMember {
  id:      string
  name:    string
  url_key: string
}

interface TheaterMember {
  name:      string
  type:      string
  member_id: number
  img:       string
  img_alt:   string
}

interface TheaterPricing {
  label:       string
  price:       number
  quota:       number
  is_ofc_only: boolean
}

interface TheaterSalesPeriod {
  label:        string
  start_date:   string
  end_date:     string
  sales_method: string
  pricing:      TheaterPricing[]
}

interface TheaterShowData {
  success:               boolean
  author:                string | null
  detail_type:           string | null
  reference_code:        string | null
  banner:                string | null
  poster:                string | null
  title:                 string
  date:                  string | null
  start_time:            string | null
  end_time:              string | null
  status:                boolean
  content_body:          string | null
  short_description:     string | null
  jkt48_member_type:     string | null
  default_price:         number | null
  total_quota:            number | null
  max_purchase:          number | null
  theater_show_id:       number | null
  set_list:              string | null
  seating_layout:        string | null
  reception_start_time:  string | null
  reception_end_time:    string | null
  is_birthday_show:      boolean
  birthday_members:      string[]
  lineup:                TheaterLineupMember[]
  jkt48_member:          TheaterMember[]
  sales_period:          TheaterSalesPeriod[]
}

type VerifyState =
  | "checking"
  | "waiting_live"
  | "verifying"
  | "granted"
  | "denied"
  | "membership"
  | "email_access"
  | "email_form"
  | "email_checking"
  | "email_denied"
  | "error"

// ─── GiStream HMAC helpers ────────────────────────────────────
async function sha256Hex(str: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("")
}

async function hmacSHA256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  )
  const buf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("")
}

async function buildHMACHeaders(): Promise<Record<string, string>> {
  const timestamp  = Date.now().toString()
  const nonce      = crypto.randomUUID().replace(/-/g, "")
  const bodyHash   = await sha256Hex("{}")
  const signingStr = `${timestamp}:${nonce}:POST:${SIGNING_PATH}:${bodyHash}`
  const signature  = await hmacSHA256Hex(PARTNER_SECRET, signingStr)
  return {
    "x-kid":       PARTNER_KID,
    "x-timestamp": timestamp,
    "x-nonce":     nonce,
    "x-signature": signature,
  }
}

async function generateGiStreamToken(slugOrId: string, isSlug: boolean): Promise<string> {
  const hmacHeaders = await buildHMACHeaders()
  const res = await fetch(`${TOKEN_API_BASE}${SIGNING_PATH}`, {
    method: "POST",
    headers: {
      ...hmacHeaders,
      ...(isSlug ? { "x-slug": slugOrId } : { "x-showid": slugOrId }),
      "Content-Type": "application/json",
    },
    body: "{}",
  })
  const data = await res.json()
  if (!data.status) throw new Error("Generate token gagal: " + data.message)
  return data.data.token
}

async function getIdnStreamData(slug: string): Promise<IdnStreamData> {
  const token = await generateGiStreamToken(slug, true)
  const res = await fetch(`${CTV_BASE}/stream?slug=${slug}`, {
    headers: { "x-api-token": token, "x-slug": slug },
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.message || "Gagal mendapatkan stream URL")

  const streams: any[] = data.streams || []
  const autoUrl = streams[0]?.url || ""

  const qualities: IdnQuality[] = streams.map((s: any, idx: number) => ({
    index:           idx,
    name:            s.NAME || `${s.RESOLUTION?.split("x")[1] || "?"}p`,
    quality:         s.NAME || `q${idx}`,
    bandwidth:       parseInt(s.BANDWIDTH) || 0,
    bandwidth_label: s.BANDWIDTH
      ? parseInt(s.BANDWIDTH) >= 1_000_000
        ? (parseInt(s.BANDWIDTH) / 1_000_000).toFixed(1) + " Mbps"
        : Math.round(parseInt(s.BANDWIDTH) / 1_000) + " Kbps"
      : "",
    resolution:  s.RESOLUTION || "",
    fps:         s["FRAME-RATE"] || "",
    manual_url:  s.url || "",
  }))

  return { url: autoUrl, token, qualities }
}

// ─── Helper: deteksi apakah string ini showId atau slug ───────
function isShowIdFormat(value: string): boolean {
  // showId biasanya pendek, formatnya "SH" diikuti angka, contoh: SH7623
  return /^SH\d+$/i.test(value)
}

// ─── IDN2 (v1) stream loader ──────────────────────────────────
async function getIdn2StreamData(showId: string, slug: string): Promise<Idn2StreamData> {
  // Server v1 ini selalu wajib query param "slug", terlepas dari
  // identifier apa yang ada di dalam token. Header tetap pakai showId
  // karena token kita generate dari showId.
  const token = await generateGiStreamToken(showId, false)  // isSlug: false

  const res = await fetch(`${V1_STREAM_BASE}/stream?slug=${slug}`, {
    headers: {
      "x-api-token": token,
      "x-showId":    showId,
    },
  })

  if (!res.ok) throw new Error(`v1 stream error: ${res.status}`)

  const m3u8Text = await res.text()

  // Parse M3U8 master playlist manually
  const lines = m3u8Text.split("\n").map(l => l.trim()).filter(Boolean)
  const qualities: Idn2Quality[] = []
  let idx = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.startsWith("#EXT-X-STREAM-INF:")) continue

    const attrs: Record<string, string> = {}
    const attrStr = line.replace("#EXT-X-STREAM-INF:", "")
    attrStr.replace(/([A-Z0-9_-]+)=("([^"]*?)"|([^,]*))/g, (_: string, key: string, _full: string, quoted: string, unquoted: string) => {
      attrs[key] = quoted !== undefined ? quoted : unquoted
      return ""
    })

    const url = lines[i + 1] ?? ""
    if (!url || url.startsWith("#")) continue

    const bandwidth  = parseInt(attrs["BANDWIDTH"] || "0") || 0
    const resolution = attrs["RESOLUTION"] || ""
    const fps        = attrs["FRAME-RATE"] || ""
    const height     = resolution ? resolution.split("x")[1] : ""

    const fpsNum = parseFloat(fps)
    const fpsSuffix = fpsNum >= 50 ? "60" : "30"
    const name = height
      ? `${height}p${fpsNum >= 50 ? fpsSuffix : ""}`
      : `Q${idx}`

    const bandwidth_label = bandwidth >= 1_000_000
      ? (bandwidth / 1_000_000).toFixed(1) + " Mbps"
      : bandwidth > 0
      ? Math.round(bandwidth / 1_000) + " Kbps"
      : ""

    qualities.push({ index: idx++, name, bandwidth, bandwidth_label, resolution, fps, url })
  }

  qualities.sort((a, b) => b.bandwidth - a.bandwidth)
  qualities.forEach((q, i) => { q.index = i })

  const autoUrl = qualities[0]?.url || ""

  return { url: autoUrl, token, qualities }
}

// ─── Theater lineup helper ──────────────────────────────────────
async function getTheaterShowData(showId: string): Promise<TheaterShowData> {
  const res  = await fetch(`${THEATER_API_BASE}/${showId}?apikey=${API_KEY}`)
  const data = await res.json()
  if (!data.success) throw new Error(data.message || "Gagal memuat lineup theater")
  return data as TheaterShowData
}

// ─── General helpers ──────────────────────────────────────────
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return m ? decodeURIComponent(m[1]) : null
}

function getUserFromStorage(): {
  user_id?: string
  username?: string
  full_name?: string
  avatar?: string | null
  membership_type?: string
  membership_expired_at?: string
  role?: string
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

function readCachedEmailAccess(showId: string | null): CachedEmailAccess | null {
  try {
    const raw = localStorage.getItem(`${EMAIL_ACCESS_KEY}_${showId ?? "global"}`)
    if (!raw) return null
    const data = JSON.parse(raw) as CachedEmailAccess
    if (Date.now() > data.expiresAt) {
      localStorage.removeItem(`${EMAIL_ACCESS_KEY}_${showId ?? "global"}`)
      return null
    }
    return data
  } catch { return null }
}

function writeCachedEmailAccess(data: CachedEmailAccess) {
  try {
    localStorage.setItem(
      `${EMAIL_ACCESS_KEY}_${data.showId ?? "global"}`,
      JSON.stringify(data)
    )
  } catch {}
}

function clearCachedEmailAccess(showId: string | null) {
  try {
    localStorage.removeItem(`${EMAIL_ACCESS_KEY}_${showId ?? "global"}`)
  } catch {}
}

function pad(n: number) { return String(n).padStart(2, "0") }

function formatSchedule(ts: number) {
  const d = new Date(ts * 1000)
  return (
    d.toLocaleDateString("id-ID", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
      timeZone: "Asia/Jakarta",
    }) +
    " · " +
    d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) +
    " WIB"
  )
}

function generateMsgId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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

function parseTokenInt(val: number | string | null | undefined): number {
  if (val == null) return 0
  const n = parseInt(String(val), 10)
  return isNaN(n) ? 0 : n
}

function isTokenMaxed(info: LiveTokenInfo): boolean {
  const maxUses   = parseTokenInt(info.max_uses)
  const usesCount = parseTokenInt(info.uses_count)
  if (maxUses <= 0) return false
  return usesCount >= maxUses
}

// ─── useViewerCount ───────────────────────────────────────────
function useViewerCount(showId: string | null, userId: string | null) {
  const [viewerCount, setViewerCount] = useState(0)
  const presenceRef  = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    if (!showId) return
    const viewerId  = userId || generateViewerId()
    const channelId = `t48-presence-${showId}`
    const channel   = supabase.channel(channelId, {
      config: { presence: { key: viewerId } },
    })
    channel
      .on("presence", { event: "sync" }, () => setViewerCount(Object.keys(channel.presenceState()).length))
      .on("presence", { event: "join" }, () => setViewerCount(Object.keys(channel.presenceState()).length))
      .on("presence", { event: "leave" }, () => setViewerCount(Object.keys(channel.presenceState()).length))
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ viewer_id: viewerId, user_id: userId ?? null, joined_at: new Date().toISOString() })
        }
      })
    presenceRef.current = channel
    return () => { channel.untrack(); supabase.removeChannel(channel); presenceRef.current = null }
  }, [showId, userId])

  return viewerCount
}

// ─── Countdown ───────────────────────────────────────────────
function useCountdown(targetTs: number | null) {
  const [diff, setDiff] = useState(0)
  useEffect(() => {
    if (!targetTs) return
    const tick = () => setDiff(Math.max(0, targetTs - Math.floor(Date.now() / 1000)))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [targetTs])
  return { diff, h: Math.floor(diff / 3600), m: Math.floor((diff % 3600) / 60), s: diff % 60 }
}

// ─── HLS Player ───────────────────────────────────────────────
function HlsPlayer({
  src, className, token,
}: {
  src: string
  className?: string
  token?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!src || !videoRef.current) return
    const video = videoRef.current
    let hls: import("hls.js").default | null = null
    let cancelled = false

    const srcWithToken = (() => {
      if (!token) return src
      try {
        const u = new URL(src)
        if (!u.searchParams.has("token") && !u.searchParams.has("x-api-token")) {
          u.searchParams.set("token", token)
        }
        return u.toString()
      } catch {
        return src
      }
    })()

    const canNativeHLS = video.canPlayType("application/vnd.apple.mpegurl")

    async function setupHlsJs() {
      const { default: Hls } = await import("hls.js")
      if (cancelled || !videoRef.current) return
      if (!Hls.isSupported()) {
        if (canNativeHLS) video.src = srcWithToken
        return
      }
      hls = new Hls({
        maxBufferLength:    30,
        maxMaxBufferLength: 60,
        ...(token && {
          xhrSetup: (xhr: XMLHttpRequest) => {
            xhr.setRequestHeader("x-api-token", token)
          },
        }),
      })
      hls.loadSource(src)
      hls.attachMedia(videoRef.current)
    }

    if (token) {
      setupHlsJs()
    } else if (canNativeHLS) {
      video.src = src
    } else {
      setupHlsJs()
    }

    return () => {
      cancelled = true
      hls?.destroy()
    }
  }, [src, token])

  return <video ref={videoRef} className={className} controls autoPlay playsInline muted />
}

// ─── IDN Quality Selector ─────────────────────────────────────
function IdnQualitySelector({
  qualities,
  currentQuality,
  onSelect,
}: {
  qualities: IdnQuality[]
  currentQuality: IdnQuality | null
  onSelect: (q: IdnQuality | null) => void
}) {
  const [open, setOpen] = useState(false)

  if (!qualities.length) return null

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
        {currentQuality ? currentQuality.name : "Auto"}
      </button>

      {open && (
        <div className="absolute bottom-[calc(100%+6px)] right-0 z-30 min-w-[180px] rounded-2xl border border-white/10 bg-gray-900/95 backdrop-blur-xl p-2 shadow-2xl">
          <p className="px-2 pb-1.5 text-[9px] font-bold uppercase tracking-widest text-white/30">Kualitas</p>
          <button
            onClick={() => { onSelect(null); setOpen(false) }}
            className={`mb-0.5 w-full rounded-xl px-3 py-2 text-left text-xs transition-colors ${
              !currentQuality ? "bg-white/10 text-white font-bold" : "text-white/60 hover:bg-white/5"
            }`}
          >
            ⚡ Auto
          </button>
          {qualities.map(q => (
            <button
              key={q.quality}
              onClick={() => { onSelect(q); setOpen(false) }}
              className={`mb-0.5 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors ${
                currentQuality?.quality === q.quality ? "bg-white/10 text-white font-bold" : "text-white/60 hover:bg-white/5"
              }`}
            >
              <span>{q.name}</span>
              <span className="text-[10px] opacity-50">{q.bandwidth_label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── IDN2 Quality Selector ────────────────────────────────────
function Idn2QualitySelector({
  qualities,
  currentQuality,
  onSelect,
}: {
  qualities: Idn2Quality[]
  currentQuality: Idn2Quality | null
  onSelect: (q: Idn2Quality | null) => void
}) {
  const [open, setOpen] = useState(false)

  if (!qualities.length) return null

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
        {currentQuality ? currentQuality.name : "Auto"}
      </button>

      {open && (
        <div className="absolute bottom-[calc(100%+6px)] right-0 z-30 min-w-[180px] rounded-2xl border border-white/10 bg-gray-900/95 backdrop-blur-xl p-2 shadow-2xl">
          <p className="px-2 pb-1.5 text-[9px] font-bold uppercase tracking-widest text-white/30">Kualitas</p>
          <button
            onClick={() => { onSelect(null); setOpen(false) }}
            className={`mb-0.5 w-full rounded-xl px-3 py-2 text-left text-xs transition-colors ${
              !currentQuality ? "bg-white/10 text-white font-bold" : "text-white/60 hover:bg-white/5"
            }`}
          >
            ⚡ Auto
          </button>
          {qualities.map(q => (
            <button
              key={q.index}
              onClick={() => { onSelect(q); setOpen(false) }}
              className={`mb-0.5 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors ${
                currentQuality?.index === q.index ? "bg-white/10 text-white font-bold" : "text-white/60 hover:bg-white/5"
              }`}
            >
              <span>{q.name}</span>
              <span className="text-[10px] opacity-50">{q.bandwidth_label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Server Selector ──────────────────────────────────────────
function ServerSelector({
  activeServer,
  onChange,
  hasRtmp,
  hasYoutube,
  loading,
}: {
  activeServer: ServerType
  onChange:     (s: ServerType) => void
  hasRtmp:      boolean
  hasYoutube:   boolean
  loading:      boolean
}) {
  const servers: { id: ServerType; label: string; icon: React.ReactNode; available: boolean }[] = [
    {
      id:   "idn",
      label: "IDN",
      available: true,
      icon: (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4l3 3" />
        </svg>
      ),
    },
    {
      id:   "idn2",
      label: "IDN 2",
      available: true,
      icon: (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4l3 3" />
          <path d="M17 17l2 2" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id:   "rtmp",
      label: "RTMP",
      available: hasRtmp,
      icon: (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.4 9.5a19.79 19.79 0 01-3.07-8.67A2 2 0 012.31 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.4a16 16 0 006.29 6.29l1.77-1.77a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
        </svg>
      ),
    },
    {
      id:   "youtube",
      label: "YouTube",
      available: hasYoutube,
      icon: (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      ),
    },
  ]

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mr-0.5">Server</span>
      {servers.map(s => (
        <button
          key={s.id}
          onClick={() => s.available && onChange(s.id)}
          disabled={!s.available || loading}
          title={!s.available ? `${s.label} tidak tersedia` : s.label}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all ${
            activeServer === s.id
              ? "bg-white text-black shadow-sm"
              : s.available
              ? "bg-white/10 text-white/60 hover:bg-white/15 hover:text-white"
              : "cursor-not-allowed bg-white/5 text-white/20"
          }`}
        >
          {loading && activeServer === s.id ? (
            <div className="h-3 w-3 animate-spin rounded-full border border-current/30 border-t-current" />
          ) : (
            s.icon
          )}
          {s.label}
        </button>
      ))}
    </div>
  )
}

// ─── Email Access Form ────────────────────────────────────────
function EmailAccessForm({
  show, onSuccess,
}: {
  show: IdnShow | null
  onSuccess: (email: string) => void
}) {
  const [email,    setEmail]    = useState("")
  const [loading,  setLoading]  = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  const handleSubmit = async () => {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) { setErrorMsg("Email wajib diisi"); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErrorMsg("Format email tidak valid"); return
    }
    setLoading(true); setErrorMsg("")
    try {
      const showId = show?.showId ?? null
      const checkUrl = showId
        ? `${API_BASE}/email-access/check?email=${encodeURIComponent(trimmed)}&show_id=${showId}&apikey=${API_KEY}`
        : `${API_BASE}/email-access/check?email=${encodeURIComponent(trimmed)}&apikey=${API_KEY}`
      const checkRes  = await fetch(checkUrl)
      const checkData = await checkRes.json()
      if (!checkData.has_access) {
        setErrorMsg(checkData.reason === "MAX_USES_REACHED"
          ? "Akses email ini sudah habis digunakan."
          : "Email ini tidak memiliki akses untuk menonton.")
        setLoading(false); return
      }
      const useRes = await fetch(`${API_BASE}/email-access/use?apikey=${API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, show_id: showId }),
      })
      const useData = await useRes.json()
      if (!useData.has_access) {
        setErrorMsg(useData.message || "Akses ditolak."); setLoading(false); return
      }
      writeCachedEmailAccess({
        email: trimmed, showId, grantedAt: Date.now(),
        expiresAt: Date.now() + EMAIL_ACCESS_TTL_MS,
      })
      onSuccess(trimmed)
    } catch {
      setErrorMsg("Gagal menghubungi server. Coba lagi.")
    } finally { setLoading(false) }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-4">
      <div className="w-full max-w-sm space-y-6">
        {show && (
          <div className="space-y-3 text-center">
            {show.image_url && (
              <div className="relative mx-auto h-36 w-full max-w-xs overflow-hidden rounded-xl bg-white/5">
                <img src={show.image_url} alt={show.title} className="h-full w-full object-cover opacity-50" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              </div>
            )}
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/40">JKT48 Live</p>
              <h1 className="text-base font-bold text-white leading-snug">{show.title}</h1>
              {show.creator && (
                <div className="flex items-center justify-center gap-2">
                  {show.creator.image_url && (
                    <img src={show.creator.image_url} alt={show.creator.name} className="h-5 w-5 rounded-full object-cover" />
                  )}
                  <span className="text-xs text-white/50">{show.creator.name}</span>
                </div>
              )}
            </div>
          </div>
        )}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-white/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <p className="text-sm font-semibold text-white">Masuk dengan Email</p>
            </div>
            <p className="text-xs text-white/40 pl-7">Masukkan email yang terdaftar untuk mengakses siaran ini.</p>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-white/50">Alamat Email</label>
              <input
                type="email" value={email}
                onChange={e => { setEmail(e.target.value); setErrorMsg("") }}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                placeholder="contoh@email.com" disabled={loading}
                className={`w-full rounded-xl border px-4 py-3 text-sm text-white bg-white/5 placeholder-white/20 outline-none transition-colors focus:border-white/30 disabled:opacity-50 ${errorMsg ? "border-red-500/50" : "border-white/10"}`}
              />
              {errorMsg && (
                <p className="text-xs text-red-400 flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {errorMsg}
                </p>
              )}
            </div>
            <button
              onClick={handleSubmit} disabled={loading || !email.trim()}
              className="w-full rounded-xl bg-white py-3 text-sm font-semibold text-black transition-all hover:bg-white/90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <><div className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black" />Memverifikasi...</>
              ) : (
                <><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Verifikasi & Tonton</>
              )}
            </button>
          </div>
        </div>
        <p className="text-center text-xs text-white/25">Akses berlaku selama 7 jam sejak verifikasi</p>
      </div>
    </div>
  )
}

// ─── Verify Screen ────────────────────────────────────────────
function VerifyScreen({
  state, tokenInfo, countdown, show, liveId, errorMsg, onRetry, onUseEmail,
}: {
  state: VerifyState; tokenInfo: LiveTokenInfo | null
  countdown: { diff: number; h: number; m: number; s: number }
  show: IdnShow | null; liveId: string; errorMsg: string
  onRetry: () => void; onUseEmail: () => void
}) {
  const isScheduled = show?.status === "scheduled" && countdown.diff > 0
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        {show && (
          <div className="space-y-3">
            {show.image_url && (
              <div className="relative mx-auto h-40 w-full max-w-xs overflow-hidden rounded-xl bg-white/5">
                <img src={show.image_url} alt={show.title} className="h-full w-full object-cover opacity-60" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              </div>
            )}
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/40">JKT48 Live</p>
              <h1 className="text-lg font-bold text-white leading-snug">{show.title}</h1>
              {show.creator && (
                <div className="flex items-center justify-center gap-2">
                  {show.creator.image_url && (
                    <img src={show.creator.image_url} alt={show.creator.name} className="h-5 w-5 rounded-full object-cover" />
                  )}
                  <span className="text-xs text-white/50">{show.creator.name}</span>
                </div>
              )}
            </div>
          </div>
        )}
        {(state === "checking" || state === "verifying") && (
          <div className="space-y-3">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            <p className="text-sm text-white/50">{state === "checking" ? "Memverifikasi akses..." : "Mengaktifkan tiket..."}</p>
          </div>
        )}
        {state === "waiting_live" && isScheduled && show && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-5 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">Siaran Dimulai Dalam</p>
              <div className="flex items-center justify-center gap-2">
                {[{ val: countdown.h, label: "JAM" }, { val: countdown.m, label: "MENIT" }, { val: countdown.s, label: "DETIK" }].map((item, i) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <div className="flex flex-col items-center">
                      <span className="font-mono text-4xl font-black text-white tabular-nums" style={{ textShadow: "0 0 24px rgba(255,255,255,0.2)" }}>{pad(item.val)}</span>
                      <span className="mt-1 text-[9px] font-semibold tracking-widest text-white/40">{item.label}</span>
                    </div>
                    {i < 2 && <span className="mb-5 text-2xl font-black text-white/30 animate-pulse">:</span>}
                  </div>
                ))}
              </div>
              {show.scheduled_at && <p className="text-xs text-white/30">{formatSchedule(show.scheduled_at)}</p>}
            </div>
            {tokenInfo && (
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left space-y-1.5">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs font-medium text-green-400">Tiket Kamu Valid</span>
                </div>
                {tokenInfo.label && <p className="text-xs text-white/50 pl-6">{tokenInfo.label}</p>}
                {tokenInfo.expires_at && (
                  <p className="text-xs text-white/30 pl-6">
                    Berlaku hingga {new Date(tokenInfo.expires_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" })}
                  </p>
                )}
              </div>
            )}
            <p className="text-xs text-white/30">Tiket akan otomatis digunakan saat show dimulai.</p>
            <div className="flex items-center justify-center gap-1.5 text-xs text-white/30">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" />
              Menunggu show dimulai...
            </div>
          </div>
        )}
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
        {state === "denied" && (
          <div className="space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 ring-1 ring-red-500/30">
              <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-white">Akses Ditolak</p>
              <p className="text-sm text-white/40">{errorMsg || "Token tidak valid, sudah digunakan, atau expired."}</p>
            </div>
            {tokenInfo && (
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left space-y-1 text-xs text-white/40">
                <p className="font-mono break-all">{liveId}</p>
                {tokenInfo.is_expired && <p className="text-red-400">⚠ Token sudah expired</p>}
                {isTokenMaxed(tokenInfo) && (
                  <p className="text-red-400">⚠ Batas penggunaan tercapai ({parseTokenInt(tokenInfo.max_uses)}x)</p>
                )}
                {!tokenInfo.is_active && <p className="text-red-400">⚠ Token dinonaktifkan admin</p>}
              </div>
            )}
            <div className="pt-2 border-t border-white/10 space-y-3">
              <p className="text-xs text-white/30">Punya akses lewat email?</p>
              <button onClick={onUseEmail}
                className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors flex items-center justify-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Masuk dengan Email
              </button>
            </div>
          </div>
        )}
        {state === "error" && (
          <div className="space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yellow-500/10 ring-1 ring-yellow-500/30">
              <svg className="h-8 w-8 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="font-semibold text-white">Terjadi Kesalahan</p>
            <p className="text-sm text-white/40">{errorMsg}</p>
            <button onClick={onRetry} className="w-full rounded-xl bg-white/10 py-2.5 text-sm font-medium text-white hover:bg-white/15 transition-colors">Coba Lagi</button>
            <button onClick={onUseEmail}
              className="w-full rounded-xl border border-white/10 bg-transparent py-2.5 text-sm font-medium text-white/50 hover:bg-white/5 hover:text-white/70 transition-colors flex items-center justify-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Atau masuk dengan Email
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Live Chat Panel ──────────────────────────────────────────
function LiveChatPanel({
  showId, chatUser, chatUserLoading,
}: {
  showId:          string
  chatUser:        ChatUser | null
  chatUserLoading: boolean
}) {
  const [messages,  setMessages]  = useState<ChatMessage[]>([])
  const [input,     setInput]     = useState("")
  const [sending,   setSending]   = useState(false)
  const chatEndRef  = useRef<HTMLDivElement>(null)
  const channelRef  = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const inputRef    = useRef<HTMLInputElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  useEffect(() => {
    if (!showId) return
    const channelName = `t48-live-chat-${showId}`
    const channel = supabase.channel(channelName, { config: { broadcast: { ack: true } } })
    channel
      .on("broadcast", { event: "chat_message" }, ({ payload }: { payload: ChatMessage }) => {
        setMessages(prev => {
          if (prev.some(m => m.id === payload.id)) return prev
          return [...prev.slice(-199), payload]
        })
      })
      .subscribe()
    channelRef.current = channel
    return () => { supabase.removeChannel(channel); channelRef.current = null }
  }, [showId])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || !chatUser || sending) return
    const msg: ChatMessage = {
      id: generateMsgId(), user_id: chatUser.user_id, username: chatUser.username,
      avatar_url: chatUser.avatar || "", full_name: chatUser.full_name,
      role: chatUser.role, text, timestamp: new Date().toISOString(),
    }
    setSending(true)
    setInput("")
    setMessages(prev => [...prev.slice(-199), msg])
    await channelRef.current?.send({ type: "broadcast", event: "chat_message", payload: msg })
    setSending(false)
    inputRef.current?.focus()
  }

  const formatTime = (iso: string) => {
    try { return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) }
    catch { return "" }
  }

  const getRoleBadge = (role: string) => {
    if (role === "admin") return <span className="rounded px-1 py-0.5 text-[9px] font-black uppercase tracking-wider bg-red-500/20 text-red-400">Admin</span>
    if (role === "reseller") return <span className="rounded px-1 py-0.5 text-[9px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-400">Reseller</span>
    return null
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          <span className="text-sm font-semibold text-white">Live Chat</span>
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
              <p className="text-sm font-medium text-white/30">Belum ada pesan</p>
              <p className="text-xs text-white/20 mt-0.5">Jadilah yang pertama komentar!</p>
            </div>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className="flex gap-2.5 items-start group">
            <div className="shrink-0 h-7 w-7 rounded-full overflow-hidden bg-white/10 flex items-center justify-center ring-1 ring-white/10">
              {msg.avatar_url ? (
                <img src={msg.avatar_url} alt={msg.full_name || msg.username} className="h-full w-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />
              ) : (
                <span className="text-[10px] font-bold text-white/60">{getInitials(msg.full_name || msg.username)}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                {getRoleBadge(msg.role)}
                <span className="text-xs font-semibold text-white/80 leading-none truncate max-w-[120px]">{msg.full_name || msg.username}</span>
                <span className="text-[10px] text-white/20 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">{formatTime(msg.timestamp)}</span>
              </div>
              <p className="text-xs leading-relaxed text-white/50 break-words">{msg.text}</p>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      <div className="px-3 py-3 border-t border-white/10 shrink-0">
        {chatUserLoading ? (
          <div className="flex items-center justify-center gap-2 py-2">
            <div className="h-3.5 w-3.5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            <span className="text-xs text-white/30">Memuat akun...</span>
          </div>
        ) : chatUser ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-full overflow-hidden bg-white/10 shrink-0">
                {chatUser.avatar ? (
                  <img src={chatUser.avatar} alt={chatUser.full_name} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-[8px] font-bold text-white/50">
                    {getInitials(chatUser.full_name || chatUser.username)}
                  </div>
                )}
              </div>
              <span className="text-[11px] text-white/40 truncate">{chatUser.full_name || chatUser.username}</span>
            </div>
            <div className="flex gap-2">
              <input
                ref={inputRef} type="text" value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSend() }}
                placeholder="Tulis komentar..." maxLength={300} disabled={sending}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white placeholder-white/20 outline-none focus:border-white/20 transition-colors disabled:opacity-50"
              />
              <button
                onClick={handleSend} disabled={!input.trim() || sending}
                className={`h-9 w-9 rounded-xl shrink-0 flex items-center justify-center transition-all ${
                  input.trim() && !sending ? "bg-white text-black hover:bg-white/90 active:scale-95" : "bg-white/10 text-white/20 cursor-not-allowed"
                }`}
              >
                {sending ? (
                  <div className="h-3.5 w-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                ) : (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-1 space-y-2">
            <p className="text-xs text-white/30">Login untuk ikut komentar</p>
            <div className="flex items-center justify-center gap-1.5 text-xs text-white/20">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Kamu masih bisa melihat chat
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Theater Lineup Section ───────────────────────────────────
function TheaterLineupSection({
  data, loading, error, onRetry,
}: {
  data:    TheaterShowData | null
  loading: boolean
  error:   string
  onRetry: () => void
}) {
  if (loading) {
    return (
      <div className="px-4 py-4 border-b border-white/10">
        <div className="flex items-center gap-2 text-xs text-white/30">
          <div className="h-3.5 w-3.5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          Memuat lineup theater...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-4 py-3 border-b border-white/10">
        <div className="flex items-center justify-between gap-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-xs text-yellow-400">
          <span>{error}</span>
          <button onClick={onRetry} className="shrink-0 underline hover:text-yellow-300 transition-colors">Coba lagi</button>
        </div>
      </div>
    )
  }

  if (!data || !data.lineup?.length) return null

  const membersById = new Map(data.jkt48_member.map(m => [String(m.member_id), m]))
  const lineup = data.lineup.map(item => {
    const member = membersById.get(item.id)
    return {
      id:      item.id,
      name:    item.name,
      url_key: item.url_key,
      img:     member?.img || member?.img_alt || null,
      type:    member?.type || data.jkt48_member_type || "",
    }
  })

  const formattedDate = (() => {
    if (!data.date) return null
    try {
      return new Date(data.date).toLocaleDateString("id-ID", {
        weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta",
      })
    } catch { return null }
  })()

  return (
    <div className="px-4 py-4 border-b border-white/10 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/40">Lineup Theater</p>
          <h2 className="text-sm font-bold text-white truncate">{data.title}</h2>
          {(formattedDate || data.start_time) && (
            <p className="text-xs text-white/30">
              {formattedDate}
              {data.start_time && ` · ${data.start_time}`}
              {data.end_time && ` - ${data.end_time}`}
              {data.start_time ? " WIB" : ""}
            </p>
          )}
        </div>
        {data.jkt48_member_type && (
          <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/50">
            {data.jkt48_member_type}
          </span>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        {lineup.map(m => (
          <div key={m.id} className="flex flex-col items-center gap-1.5 shrink-0 w-16">
            <div className="h-14 w-14 rounded-full overflow-hidden bg-white/10 ring-1 ring-white/10">
              {m.img ? (
                <img src={m.img} alt={m.name} className="h-full w-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-xs font-bold text-white/40">
                  {getInitials(m.name)}
                </div>
              )}
            </div>
            <p className="text-[10px] text-white/60 text-center leading-tight line-clamp-2">{m.name}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Player View ──────────────────────────────────────────────
function PlayerView({
  show, streamData, activeSource, setActiveSource, liveId,
  isMember, user, accessMode, accessEmail, onSignOutEmail,
}: {
  show:            IdnShow
  streamData:      StreamData | null
  activeSource:    string
  setActiveSource: (s: "rtmp" | "youtube") => void
  liveId:          string
  isMember:        boolean
  user:            { username?: string; full_name?: string; avatar?: string | null; user_id?: string; role?: string } | null
  accessMode:      "token" | "membership" | "email"
  accessEmail?:    string
  onSignOutEmail?: () => void
}) {
  const countdown   = useCountdown(show.status === "scheduled" ? (show.scheduled_at ?? null) : null)
  const isLive      = show.status === "live"
  const isEnded     = show.status === "ended"
  const isScheduled = show.status === "scheduled"
  const showCountdown = isScheduled && countdown.diff > 0

  // ── Server selector state ────────────────────────────────────
  const [activeServer,      setActiveServerState]  = useState<ServerType>("idn")
  const [idnStreamData,     setIdnStreamData]      = useState<IdnStreamData | null>(null)
  const [idnCurrentQuality, setIdnCurrentQuality]  = useState<IdnQuality | null>(null)
  const [idnLoading,        setIdnLoading]          = useState(false)
  const [idnError,          setIdnError]            = useState("")
  const idnLoadedRef = useRef(false)

  // ── IDN2 state ───────────────────────────────────────────────
  const [idn2StreamData,     setIdn2StreamData]     = useState<Idn2StreamData | null>(null)
  const [idn2CurrentQuality, setIdn2CurrentQuality] = useState<Idn2Quality | null>(null)
  const [idn2Loading,        setIdn2Loading]         = useState(false)
  const [idn2Error,          setIdn2Error]           = useState("")
  const idn2LoadedRef = useRef(false)

  // ── Chat user ────────────────────────────────────────────────
  const [chatUser,        setChatUser]        = useState<ChatUser | null>(null)
  const [chatUserLoading, setChatUserLoading] = useState(true)

  // ── Realtime viewer count ──────────────────────────────────────
  const viewerCount = useViewerCount(show.showId, user?.user_id ?? null)

  // ── Theater lineup ──────────────────────────────────────────────
  const [theaterData,    setTheaterData]    = useState<TheaterShowData | null>(null)
  const [theaterLoading, setTheaterLoading] = useState(true)
  const [theaterError,   setTheaterError]   = useState("")

  const loadTheaterLineup = useCallback(async () => {
    if (!show.showId) { setTheaterLoading(false); return }
    setTheaterLoading(true)
    setTheaterError("")
    try {
      const data = await getTheaterShowData(show.showId)
      setTheaterData(data)
    } catch (e: any) {
      setTheaterError(e?.message || "Gagal memuat lineup theater")
    } finally {
      setTheaterLoading(false)
    }
  }, [show.showId])

  useEffect(() => { loadTheaterLineup() }, [loadTheaterLineup])

  // ── Load IDN stream via GiStream (CTV) ───────────────────────
  const loadIdnStream = useCallback(async () => {
    if (!show.slug) { setIdnError("Slug show tidak tersedia"); return }
    setIdnLoading(true)
    setIdnError("")
    try {
      const data = await getIdnStreamData(show.slug)
      setIdnStreamData(data)
      setIdnCurrentQuality(null)
    } catch (e: any) {
      setIdnError(e?.message || "Gagal memuat stream IDN")
    } finally {
      setIdnLoading(false)
    }
  }, [show.slug])

  // ── Load IDN2 stream via v1 (pure M3U8) ──────────────────────
const loadIdn2Stream = useCallback(async () => {
  if (!show.showId) { setIdn2Error("Show ID tidak tersedia"); return }
  if (!show.slug)   { setIdn2Error("Slug show tidak tersedia"); return }  // ← tambah guard
  setIdn2Loading(true)
  setIdn2Error("")
  try {
    const data = await getIdn2StreamData(show.showId, show.slug)  // ← pass slug
    setIdn2StreamData(data)
    setIdn2CurrentQuality(null)
  } catch (e: any) {
    setIdn2Error(e?.message || "Gagal memuat stream IDN 2")
  } finally {
    setIdn2Loading(false)
  }
}, [show.showId, show.slug])  // ← tambah show.slug di deps

  // ── Switch server ─────────────────────────────────────────────
  const handleServerChange = useCallback(async (server: ServerType) => {
    setActiveServerState(server)
    if (server === "idn" && !idnLoadedRef.current) {
      idnLoadedRef.current = true
      await loadIdnStream()
    }
    if (server === "idn2" && !idn2LoadedRef.current) {
      idn2LoadedRef.current = true
      await loadIdn2Stream()
    }
  }, [loadIdnStream, loadIdn2Stream])

  // ── Auto-load IDN on mount when live ─────────────────────────
  useEffect(() => {
    if (isLive && !idnLoadedRef.current) {
      idnLoadedRef.current = true
      loadIdnStream()
    }
  }, [isLive, loadIdnStream])

  // ── Active IDN URL (quality-aware) ────────────────────────────
  const idnStreamUrl = (() => {
    if (!idnStreamData) return null
    if (idnCurrentQuality) return idnCurrentQuality.manual_url
    return idnStreamData.url
  })()

  // ── Active IDN2 URL (quality-aware) ───────────────────────────
  const idn2StreamUrl = (() => {
    if (!idn2StreamData) return null
    if (idn2CurrentQuality) return idn2CurrentQuality.url
    return idn2StreamData.url
  })()

  // ── RTMP / YouTube from streamData ────────────────────────────
  const rtmpUrl    = streamData?.rtmp?.url ?? null
  const youtubeUrl = streamData?.youtube?.embed_url ?? null
  const fallbackUrl = show.playback_url ?? null

  const hasRtmp    = !!rtmpUrl
  const hasYoutube = !!youtubeUrl

  // ── Loading state for server selector ────────────────────────
  const isServerLoading =
    (activeServer === "idn" && idnLoading) ||
    (activeServer === "idn2" && idn2Loading)

  // ── Chat init ─────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      setChatUserLoading(true)
      try {
        const stored = getUserFromStorage()
        if (!stored?.user_id) { setChatUserLoading(false); return }
        let profile: ChatUser = {
          user_id: stored.user_id, username: stored.username || "",
          full_name: stored.full_name || stored.username || "",
          avatar: stored.avatar || null, role: stored.role || "user",
        }
        try {
          const res = await fetch(`${API_BASE}/profile/${stored.user_id}?apikey=${API_KEY}`)
          const data = await res.json()
          if (data.status && data.data) {
            profile = {
              user_id:   data.data.user_id   || stored.user_id,
              username:  data.data.username  || stored.username  || "",
              full_name: data.data.full_name || stored.full_name || stored.username || "",
              avatar:    data.data.avatar    || stored.avatar    || null,
              role:      data.data.role      || stored.role      || "user",
            }
          }
        } catch {}
        setChatUser(profile)
      } finally { setChatUserLoading(false) }
    }
    init()
  }, [user?.user_id]) // eslint-disable-line

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {show.creator.image_url && (
            <img src={show.creator.image_url} alt={show.creator.name} className="h-7 w-7 rounded-full object-cover shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{show.title}</p>
            <p className="text-xs text-white/40 truncate">@{show.creator.username}</p>
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
          {accessMode === "membership" || isMember ? (
            <span className="flex items-center gap-1 rounded-full bg-blue-500/20 px-2.5 py-1 text-xs font-medium text-blue-300">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
              Member
            </span>
          ) : accessMode === "email" ? (
            <span className="flex items-center gap-1 rounded-full bg-purple-500/20 px-2.5 py-1 text-xs font-medium text-purple-300">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Email
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
            <div className="relative flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold">
              <span className="absolute h-1.5 w-1.5 rounded-full bg-white animate-ping" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-white" />
              LIVE
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row min-h-0">
        <div className="flex flex-col flex-1 min-w-0">

          {/* ── Video player ── */}
          <div className="relative w-full bg-black shrink-0" style={{ aspectRatio: "16/9" }}>
            {/* Thumbnail / placeholder */}
            {show.image_url && (
              <img src={show.image_url} alt={show.title}
                className={`absolute inset-0 h-full w-full object-cover transition-opacity ${
                  isLive && (idnStreamUrl || idn2StreamUrl || rtmpUrl || youtubeUrl || fallbackUrl) ? "opacity-0" : "opacity-60"
                }`}
              />
            )}

            {/* IDN server */}
            {isLive && activeServer === "idn" && (
              idnLoading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                  <p className="text-xs text-white/50">Memuat stream IDN...</p>
                </div>
              ) : idnError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 gap-3">
                  <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-white/50">{idnError}</p>
                  <button onClick={loadIdnStream} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20 transition-colors">
                    Coba Lagi
                  </button>
                </div>
              ) : idnStreamUrl ? (
                <HlsPlayer
                  src={idnStreamUrl}
                  token={idnStreamData?.token}
                  className="absolute inset-0 h-full w-full object-contain bg-black"
                />
              ) : null
            )}

            {/* IDN2 server (v1 pure M3U8) */}
            {isLive && activeServer === "idn2" && (
              idn2Loading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                  <p className="text-xs text-white/50">Memuat stream IDN 2...</p>
                </div>
              ) : idn2Error ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 gap-3">
                  <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-white/50">{idn2Error}</p>
                  <button onClick={loadIdn2Stream} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20 transition-colors">
                    Coba Lagi
                  </button>
                </div>
              ) : idn2StreamUrl ? (
                <HlsPlayer
                  src={idn2StreamUrl}
                  token={idn2StreamData?.token}
                  className="absolute inset-0 h-full w-full object-contain bg-black"
                />
              ) : null
            )}

            {/* RTMP server */}
            {isLive && activeServer === "rtmp" && rtmpUrl && (
              <HlsPlayer src={rtmpUrl} className="absolute inset-0 h-full w-full object-contain bg-black" />
            )}
            {isLive && activeServer === "rtmp" && !rtmpUrl && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                <p className="text-sm text-white/40">Stream RTMP tidak tersedia</p>
              </div>
            )}

            {/* YouTube server */}
            {isLive && activeServer === "youtube" && youtubeUrl && (
              <iframe src={youtubeUrl} className="absolute inset-0 h-full w-full"
                allow="autoplay; encrypted-media; fullscreen" allowFullScreen />
            )}
            {isLive && activeServer === "youtube" && !youtubeUrl && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                <p className="text-sm text-white/40">Stream YouTube tidak tersedia</p>
              </div>
            )}

            {/* Fallback (legacy rtmp field from old API) */}
            {isLive && activeServer === "rtmp" && !rtmpUrl && fallbackUrl && (
              <HlsPlayer src={fallbackUrl} className="absolute inset-0 h-full w-full object-contain bg-black" />
            )}

            {/* Countdown overlay */}
            {showCountdown && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
                <p className="mb-4 text-xs font-semibold tracking-[0.2em] text-white/70 uppercase">Siaran Dimulai Dalam</p>
                <div className="flex items-center gap-3">
                  {[{ val: countdown.h, label: "JAM" }, { val: countdown.m, label: "MENIT" }, { val: countdown.s, label: "DETIK" }].map((item, i) => (
                    <div key={item.label} className="flex items-center gap-3">
                      <div className="flex flex-col items-center">
                        <span className="font-mono text-5xl font-black tracking-tight text-white tabular-nums" style={{ textShadow: "0 0 30px rgba(255,255,255,0.3)" }}>{pad(item.val)}</span>
                        <span className="mt-1 text-[10px] font-semibold tracking-widest text-white/50">{item.label}</span>
                      </div>
                      {i < 2 && <span className="mb-5 text-3xl font-black text-white/40 animate-pulse">:</span>}
                    </div>
                  ))}
                </div>
                {show.scheduled_at && <p className="mt-4 text-xs text-white/30">{formatSchedule(show.scheduled_at)}</p>}
              </div>
            )}

            {/* Ended overlay */}
            {isEnded && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
                <svg className="h-10 w-10 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.362a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                </svg>
                <p className="mt-3 text-sm font-medium text-white/50">Show telah selesai</p>
              </div>
            )}

            {/* IDN quality selector */}
            {isLive && activeServer === "idn" && idnStreamData && (idnStreamData.qualities.length > 1) && (
              <div className="absolute bottom-3 right-3 z-20">
                <IdnQualitySelector
                  qualities={idnStreamData.qualities}
                  currentQuality={idnCurrentQuality}
                  onSelect={setIdnCurrentQuality}
                />
              </div>
            )}

            {/* IDN2 quality selector */}
            {isLive && activeServer === "idn2" && idn2StreamData && (idn2StreamData.qualities.length > 1) && (
              <div className="absolute bottom-3 right-3 z-20">
                <Idn2QualitySelector
                  qualities={idn2StreamData.qualities}
                  currentQuality={idn2CurrentQuality}
                  onSelect={setIdn2CurrentQuality}
                />
              </div>
            )}
          </div>

          {/* ── Info bar (title + server selector) ── */}
          <div className="px-4 py-4 space-y-3 border-b border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1.5 min-w-0">
                <h1 className="text-base font-semibold leading-snug">{show.title}</h1>
                {/* Status badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  {isLive && (
                    <span className="flex items-center gap-1 rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-semibold text-red-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />LIVE
                    </span>
                  )}
                  {isScheduled && <span className="rounded-full bg-blue-500/20 px-2.5 py-0.5 text-xs font-medium text-blue-400">Terjadwal</span>}
                  {isEnded && <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/40">Selesai</span>}
                  {show.idnliveplus?.liveroom_price != null && (
                    <span className="rounded-full bg-yellow-500/20 px-2.5 py-0.5 text-xs font-medium text-yellow-400">{show.idnliveplus.liveroom_price} gold</span>
                  )}
                </div>
              </div>

              {/* Creator avatar */}
              <div className="flex items-center gap-2 shrink-0">
                {show.creator.image_url && (
                  <img src={show.creator.image_url} alt={show.creator.name} className="h-9 w-9 rounded-full object-cover ring-1 ring-white/20" />
                )}
                <div className="hidden sm:block">
                  <p className="text-sm font-semibold">{show.creator.name}</p>
                  <p className="text-xs text-white/40">@{show.creator.username}</p>
                </div>
              </div>
            </div>

            {/* ── SERVER SELECTOR ── */}
            {isLive && (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <ServerSelector
                  activeServer={activeServer}
                  onChange={handleServerChange}
                  hasRtmp={hasRtmp}
                  hasYoutube={hasYoutube}
                  loading={isServerLoading}
                />
                {/* IDN stream note */}
                {activeServer === "idn" && idnStreamData && (
                  <p className="text-[10px] text-white/25 flex items-center gap-1">
                    <span className="inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
                    GiStream · {idnStreamData.qualities.length} kualitas tersedia
                  </p>
                )}
                {activeServer === "idn" && idnError && (
                  <button onClick={loadIdnStream} className="text-[10px] text-red-400 hover:text-red-300 underline transition-colors">
                    Retry
                  </button>
                )}
                {/* IDN2 stream note */}
                {activeServer === "idn2" && idn2StreamData && (
                  <p className="text-[10px] text-white/25 flex items-center gap-1">
                    <span className="inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
                    GiStream-V2 · {idn2StreamData.qualities.length} kualitas tersedia
                  </p>
                )}
                {activeServer === "idn2" && idn2Error && (
                  <button onClick={loadIdn2Stream} className="text-[10px] text-red-400 hover:text-red-300 underline transition-colors">
                    Retry
                  </button>
                )}
              </div>
            )}

            {/* Scheduled time */}
            {isScheduled && show.scheduled_at && (
              <div className="flex items-center gap-2 text-xs text-white/50">
                <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {formatSchedule(show.scheduled_at)}
              </div>
            )}

            {/* Description */}
            {show.idnliveplus?.description && (
              <p className="text-xs text-white/50 leading-relaxed whitespace-pre-line line-clamp-3">
                {show.idnliveplus.description.trim()}
              </p>
            )}

            {/* No stream warning (IDN) */}
            {isLive && activeServer === "idn" && !idnLoading && !idnStreamUrl && !idnError && (
              <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-xs text-yellow-400">
                Stream IDN belum tersedia untuk show ini.
              </div>
            )}

            {/* No stream warning (IDN2) */}
            {isLive && activeServer === "idn2" && !idn2Loading && !idn2StreamUrl && !idn2Error && (
              <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-xs text-yellow-400">
                Stream IDN 2 belum tersedia untuk show ini.
              </div>
            )}
          </div>

          {/* ── Theater lineup ── */}
          <TheaterLineupSection
            data={theaterData}
            loading={theaterLoading}
            error={theaterError}
            onRetry={loadTheaterLineup}
          />

          {/* ── Access info bar ── */}
          <div className="px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-white/20">
              {accessMode === "membership"
                ? `Akses via membership · ${user?.username ?? "member"}`
                : accessMode === "email"
                ? `Akses via email · ${accessEmail ?? ""}`
                : `Akses via tiket · ${liveId}`}
            </p>
            {accessMode === "email" && onSignOutEmail && (
              <button onClick={onSignOutEmail} className="text-xs text-white/25 hover:text-white/50 transition-colors">Keluar</button>
            )}
          </div>
        </div>

        {/* ── Chat panel ── */}
        <div className="w-full lg:w-80 xl:w-96 border-t lg:border-t-0 lg:border-l border-white/10 flex flex-col shrink-0 lg:h-[calc(100vh-57px)] lg:sticky lg:top-[57px]">
          <LiveChatPanel
            showId={show.showId}
            chatUser={chatUser}
            chatUserLoading={chatUserLoading}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────
export default function LiveTokenPage() {
  const params = useParams<{ liveId: string }>()
  const liveId = params?.liveId ?? ""

  const isMembRoute    = liveId === "memb"
  const hasTokenInUrl  = !!liveId && liveId !== "memb"

  const [verifyState,  setVerifyState]  = useState<VerifyState>("checking")
  const [tokenInfo,    setTokenInfo]    = useState<LiveTokenInfo | null>(null)
  const [show,         setShow]         = useState<IdnShow | null>(null)
  const [streamData,   setStreamData]   = useState<StreamData | null>(null)
  const [activeSource, setActiveSource] = useState<"rtmp" | "youtube">("rtmp")
  const [errorMsg,     setErrorMsg]     = useState("")
  const [accessMode,   setAccessMode]   = useState<"token" | "membership" | "email">("token")
  const [accessEmail,  setAccessEmail]  = useState<string | undefined>(undefined)

  const pollingRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const consumedRef = useRef(false)
  const countdown   = useCountdown(show?.status === "scheduled" ? (show.scheduled_at ?? null) : null)

  const fetchAllShows = useCallback(async (): Promise<IdnShow[]> => {
    try {
      const res  = await fetch(IDN_API)
      const data = await res.json()
      return Array.isArray(data.data) ? data.data : []
    } catch { return [] }
  }, [])

  const findShow = useCallback(async (showId: string | null): Promise<IdnShow | null> => {
    const all = await fetchAllShows()
    if (!all.length) return null
    if (showId) {
      const exact = all.find(s => s.showId === showId)
      if (exact) return applyThumbnailOverride(exact)
    }
    const live = all.filter(s => s.status === "live")
    if (live.length) return applyThumbnailOverride(live[0])
    const now = Date.now() / 1000
    const upcoming = all
      .filter(s => s.status === "scheduled" && s.scheduled_at)
      .sort((a, b) => Math.abs((a.scheduled_at ?? 0) - now) - Math.abs((b.scheduled_at ?? 0) - now))
    if (upcoming.length) return applyThumbnailOverride(upcoming[0])
    const ended = all.filter(s => s.status === "ended").sort((a, b) => (b.end_at ?? 0) - (a.end_at ?? 0))
    const fallback = ended[0] ?? all[0]
    return fallback ? applyThumbnailOverride(fallback) : null
  }, [fetchAllShows])

  const fetchStream = useCallback(async (showId: string) => {
    try {
      const res  = await fetch(`${API_BASE}/stream/${showId}?apikey=${API_KEY}`)
      const data = await res.json()
      if (data.status && data.data) {
        setStreamData(data.data)
        if (data.sources?.length) setActiveSource(data.sources[0].type as "rtmp" | "youtube")
      }
    } catch {}
  }, [])

  const fetchTokenInfo = useCallback(async (): Promise<LiveTokenInfo | null> => {
    try {
      const res  = await fetch(`${API_BASE}/live/${liveId}/info?apikey=${API_KEY}`)
      const data = await res.json()
      return data.status && data.data ? data.data : null
    } catch { return null }
  }, [liveId])

  const consumeToken = useCallback(async (info: LiveTokenInfo): Promise<boolean> => {
    try {
      const res  = await fetch(`${API_BASE}/live/${liveId}?apikey=${API_KEY}`)
      const data = await res.json()
      if (data.status) {
        writeCachedAccess({
          liveId, showId: info.show_id, consumedAt: Date.now(),
          expiresAt: info.expires_at ? new Date(info.expires_at).getTime() : null,
        })
        return true
      }
      if (data.code === "MAX_USES_REACHED") {
        const freshInfo = await fetchTokenInfo()
        const checkInfo = freshInfo ?? info
        if (!isTokenMaxed(checkInfo)) {
          writeCachedAccess({
            liveId, showId: checkInfo.show_id, consumedAt: Date.now(),
            expiresAt: checkInfo.expires_at ? new Date(checkInfo.expires_at).getTime() : null,
          })
          setTokenInfo(checkInfo)
          return true
        }
        setErrorMsg(`Token sudah mencapai batas penggunaan (${parseTokenInt(checkInfo.max_uses)}x)`)
        return false
      }
      setErrorMsg(data.message || "Token tidak valid"); return false
    } catch {
      setErrorMsg("Gagal menghubungi server"); return false
    }
  }, [liveId, fetchTokenInfo])

  const handleEmailAccessGranted = useCallback(async (email: string) => {
    setAccessEmail(email); setAccessMode("email"); setVerifyState("email_access")
    const s = await findShow(null)
    if (s) { setShow(s); fetchStream(s.showId) }
  }, [findShow, fetchStream])

  const handleSignOutEmail = useCallback(() => {
    clearCachedEmailAccess(show?.showId ?? null)
    setAccessEmail(undefined); setAccessMode("token"); setVerifyState("email_form")
  }, [show])

  const runVerification = useCallback(async () => {
    setVerifyState("checking"); consumedRef.current = false

    const cachedEmail = readCachedEmailAccess(null)
    if (cachedEmail) {
      setAccessEmail(cachedEmail.email); setAccessMode("email"); setVerifyState("email_access")
      const s = await findShow(null)
      if (s) { setShow(s); fetchStream(s.showId) }
      return
    }

    if (isMembRoute) {
      const user = getUserFromStorage()
      if (!user || !isMembershipActive(user.membership_type, user.membership_expired_at)) {
        setErrorMsg("Halaman ini hanya untuk member aktif."); setVerifyState("denied"); return
      }
      setAccessMode("membership"); setVerifyState("membership")
      const s = await findShow(null)
      if (s) { setShow(s); fetchStream(s.showId) }
      return
    }

    if (!hasTokenInUrl) {
      const s = await findShow(null); if (s) setShow(s)
      setVerifyState("email_form"); return
    }

    const cached = readCachedAccess(liveId)
    if (cached) {
      setAccessMode("token"); setVerifyState("granted")
      const s = await findShow(cached.showId)
      if (s) { setShow(s); fetchStream(s.showId) }
      return
    }

    const user = getUserFromStorage()
    if (user && isMembershipActive(user.membership_type, user.membership_expired_at)) {
      setAccessMode("membership"); setVerifyState("membership")
      const info = await fetchTokenInfo(); if (info) setTokenInfo(info)
      const s = await findShow(info?.show_id ?? null)
      if (s) { setShow(s); fetchStream(s.showId) }
      return
    }

    const info = await fetchTokenInfo()
    if (!info) { setErrorMsg("Token tidak ditemukan"); setVerifyState("denied"); return }
    setTokenInfo(info)

    if (!info.is_active) { setErrorMsg("Token dinonaktifkan admin"); setVerifyState("denied"); return }
    if (info.is_expired)  { setErrorMsg("Token sudah expired");       setVerifyState("denied"); return }

    if (isTokenMaxed(info)) {
      setErrorMsg(`Token sudah mencapai batas penggunaan (${parseTokenInt(info.max_uses)}x)`)
      setVerifyState("denied"); return
    }

    const s = await findShow(info.show_id); if (s) setShow(s)
    const status = s?.status ?? "scheduled"

    if (status === "live" || status === "ended") {
      setVerifyState("verifying")
      const ok = await consumeToken(info)
      if (ok) { consumedRef.current = true; setAccessMode("token"); setVerifyState("granted"); if (s) fetchStream(s.showId) }
      else     { setVerifyState("denied") }
      return
    }

    setVerifyState("waiting_live")
  }, [liveId, isMembRoute, hasTokenInUrl, fetchTokenInfo, findShow, fetchStream, consumeToken])

  useEffect(() => { runVerification() }, [runVerification])

  useEffect(() => {
    if (verifyState !== "waiting_live") {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
      return
    }
    if (pollingRef.current) return
    pollingRef.current = setInterval(async () => {
      const showId  = tokenInfo?.show_id ?? show?.showId ?? null
      const current = await findShow(showId)
      if (!current) return
      setShow(applyThumbnailOverride(current))
      if (current.status === "live") {
        clearInterval(pollingRef.current!); pollingRef.current = null
        setVerifyState("verifying")
        const info = tokenInfo ?? await fetchTokenInfo()
        if (!info) { setErrorMsg("Token tidak ditemukan"); setVerifyState("denied"); return }
        const ok = await consumeToken(info)
        if (ok) { consumedRef.current = true; setAccessMode("token"); setVerifyState("granted"); fetchStream(current.showId) }
        else     { setVerifyState("denied") }
      }
    }, 15000)
    return () => { if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null } }
  }, [verifyState, tokenInfo, show, findShow, fetchTokenInfo, consumeToken, fetchStream])

  const user     = typeof window !== "undefined" ? getUserFromStorage() : null
  const isMember = isMembershipActive(user?.membership_type, user?.membership_expired_at)

  if (verifyState === "email_form") {
    return <EmailAccessForm show={show} onSuccess={handleEmailAccessGranted} />
  }

  const isVerifyScreen =
    verifyState !== "granted" &&
    verifyState !== "membership" &&
    verifyState !== "email_access"

  if (isVerifyScreen) {
    return (
      <VerifyScreen
        state={verifyState} tokenInfo={tokenInfo} countdown={countdown}
        show={show} liveId={liveId} errorMsg={errorMsg}
        onRetry={runVerification} onUseEmail={() => setVerifyState("email_form")}
      />
    )
  }

  if (!show) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          <p className="text-sm text-white/50">Memuat show...</p>
        </div>
      </div>
    )
  }

  return (
    <PlayerView
      show={show} streamData={streamData}
      activeSource={activeSource} setActiveSource={setActiveSource}
      liveId={liveId} isMember={isMember} user={user}
      accessMode={accessMode} accessEmail={accessEmail}
      onSignOutEmail={accessMode === "email" ? handleSignOutEmail : undefined}
    />
  )
}
