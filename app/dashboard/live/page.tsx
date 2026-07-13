"use client"

import { useEffect, useState, useRef, useCallback, useMemo } from "react"
import Link from "next/link"

// ─── Constants ───────────────────────────────────────────────
const LIVE_API   = "https://v5.jkt48connect.com/api/jkt48/live?apikey=JKTCONNECT"
const POLL_MS    = 15000

// ─── Types ───────────────────────────────────────────────────
interface StreamingUrl {
  label:   string
  quality: number
  url:     string
}

interface LiveMember {
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

// ─── Helpers ─────────────────────────────────────────────────
function memberHref(m: LiveMember) {
  return `/live/member/${m.slug || m.url_key}`
}

function elapsedLabel(iso: string): string {
  const started = new Date(iso).getTime()
  if (Number.isNaN(started)) return ""
  const diffMs = Date.now() - started
  const mins   = Math.floor(diffMs / 60000)
  if (mins < 1)  return "Baru mulai"
  if (mins < 60) return `${mins} menit lalu`
  const hrs  = Math.floor(mins / 60)
  const rest = mins % 60
  return rest > 0 ? `${hrs}j ${rest}m lalu` : `${hrs} jam lalu`
}

function typeBadgeClass(type: string) {
  return type?.toLowerCase() === "showroom"
    ? "bg-pink-500/15 text-pink-400 border-pink-500/30"
    : "bg-red-500/15 text-red-400 border-red-500/30"
}

// ─── Skeleton ────────────────────────────────────────────────
function SkeletonTile() {
  return (
    <div className="rounded-2xl overflow-hidden border border-border bg-card animate-pulse">
      <div className="aspect-[3/4] bg-muted" />
      <div className="p-3 space-y-2">
        <div className="h-3.5 w-2/3 rounded bg-muted" />
        <div className="h-3 w-1/3 rounded bg-muted" />
      </div>
    </div>
  )
}

// ─── Member Tile ─────────────────────────────────────────────
function MemberTile({ member }: { member: LiveMember }) {
  const [imgErr, setImgErr] = useState(false)
  const thumb = !imgErr && (member.img_alt || member.img) ? (member.img_alt || member.img) : null

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card hover:border-foreground/25 hover:bg-muted/40 transition-colors">
      {/* Thumbnail */}
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-muted">
        {thumb ? (
          <img
            src={thumb}
            alt={member.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgErr(true)}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <svg className="h-10 w-10 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.362a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
          </div>
        )}

        {/* Gradient overlay for readability (kept dark since it sits over a photo, not the page bg) */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />

        {/* LIVE badge */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white shadow">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
          </span>
          LIVE
        </div>

        {/* Type badge */}
        <div className={`absolute top-2.5 right-2.5 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${typeBadgeClass(member.type)}`}>
          {member.type}
        </div>

        {/* Name + meta over the image (text stays white here since it overlays the photo gradient) */}
        <div className="absolute inset-x-0 bottom-0 p-3 space-y-1.5">
          <p className="text-sm font-semibold leading-snug text-white truncate">{member.name}</p>
          <p className="text-[11px] text-white/60 truncate">{elapsedLabel(member.started_at)}</p>

          <Link
            href={memberHref(member)}
            className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-white py-1.5 text-xs font-semibold text-black hover:bg-white/90 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            Tonton Sekarang
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────
export default function LiveMembersPage() {
  const [members, setMembers] = useState<LiveMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState("")
  const [query, setQuery]     = useState("")
  const [typeFilter, setTypeFilter] = useState<"all" | "idn" | "showroom">("all")
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const pollingRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const inFlightRef = useRef(false)

  const loadMembers = useCallback(async (isInitial = false) => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const res  = await fetch(LIVE_API, { cache: "no-store" })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = await res.json()
      const list: LiveMember[] = Array.isArray(data) ? data : []
      setMembers(list)
      setLastUpdated(new Date())
      setError("")
    } catch {
      if (isInitial) setError("Gagal memuat daftar member yang sedang live.")
    } finally {
      if (isInitial) setLoading(false)
      inFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    loadMembers(true)
    pollingRef.current = setInterval(() => loadMembers(false), POLL_MS)

    const handleVisibility = () => {
      if (document.visibilityState === "visible") loadMembers(false)
    }
    document.addEventListener("visibilitychange", handleVisibility)
    window.addEventListener("focus", handleVisibility)

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
      document.removeEventListener("visibilitychange", handleVisibility)
      window.removeEventListener("focus", handleVisibility)
    }
  }, [loadMembers])

  const counts = useMemo(() => ({
    all:      members.length,
    idn:      members.filter(m => m.type?.toLowerCase() === "idn").length,
    showroom: members.filter(m => m.type?.toLowerCase() === "showroom").length,
  }), [members])

  const filtered = useMemo(() => {
    let list = members
    if (typeFilter !== "all") list = list.filter(m => m.type?.toLowerCase() === typeFilter)
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter(m => m.name.toLowerCase().includes(q) || m.url_key.toLowerCase().includes(q))
    }
    return list
  }, [members, typeFilter, query])

  const tabs: { key: typeof typeFilter; label: string }[] = [
    { key: "all",      label: "Semua" },
    { key: "idn",      label: "IDN Live" },
    { key: "showroom", label: "Showroom" },
  ]

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              Member Sedang Live
              {counts.all > 0 && (
                <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                  {counts.all}
                </span>
              )}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              JKT48 IDN Live &amp; Showroom — update otomatis tiap 15 detik
              {lastUpdated && (
                <> · terakhir {lastUpdated.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })} WIB</>
              )}
            </p>
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-64">
            <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Cari member..."
              className="w-full rounded-xl border border-input bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTypeFilter(t.key)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                typeFilter === t.key
                  ? "border-foreground bg-foreground text-background"
                  : "border-input bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              <span className="ml-1.5 opacity-60">({counts[t.key]})</span>
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {Array.from({ length: 10 }).map((_, i) => <SkeletonTile key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <svg className="h-10 w-10 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.362a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
            <p className="text-sm text-muted-foreground">
              {query.trim() || typeFilter !== "all"
                ? "Tidak ada member yang cocok dengan pencarian/filter."
                : "Belum ada member yang sedang live saat ini."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {filtered.map(member => (
              <MemberTile key={member.identifier || member.url_key} member={member} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
