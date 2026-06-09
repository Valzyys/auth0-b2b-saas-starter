"use client"

import { useEffect, useState } from "react"

const API_URL = "https://v5.jkt48connect.com/api/jkt48/idnplus?apikey=JKTCONNECT"

interface IdnLivePlus {
  liveroom_price: number
  currency_code: string
  audience_limit: number | null
  description: string
  exp: number
}

interface Show {
  slug: string
  title: string
  image_url: string
  category: { name: string; slug: string }
  creator: {
    name: string
    image_url: string
    username: string
  }
  view_count: number
  unique_view_count: number
  playback_url: string
  room_identifier: string
  status: string
  live_at: number
  end_at: number
  scheduled_at: number
  live_type: string
  idnliveplus: IdnLivePlus | null
  showId: string
}

function formatDate(ts: number) {
  if (!ts) return "-"
  return new Date(ts * 1000).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  })
}

function formatTime(ts: number) {
  if (!ts) return "-"
  return new Date(ts * 1000).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }) + " WIB"
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    scheduled: { label: "Terjadwal", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    live:       { label: "Live",      cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 animate-pulse" },
    ended:      { label: "Selesai",   cls: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
  }
  const s = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-500" }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
      {status === "live" && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
      {s.label}
    </span>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden animate-pulse">
      <div className="h-48 bg-muted" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-3 bg-muted rounded w-1/2" />
        <div className="h-3 bg-muted rounded w-2/3" />
      </div>
    </div>
  )
}

export default function SchedulePage() {
  const [shows, setShows] = useState<Show[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | "scheduled" | "live" | "ended">("all")

  useEffect(() => {
    fetch(API_URL)
      .then(r => r.json())
      .then(d => {
        if (d.status === 200 && Array.isArray(d.data)) {
          setShows(d.data)
        } else {
          setError("Gagal memuat jadwal show.")
        }
      })
      .catch(() => setError("Terjadi kesalahan jaringan."))
      .finally(() => setLoading(false))
  }, [])

  const filtered = filter === "all" ? shows : shows.filter(s => s.status === filter)

  const tabs: { key: typeof filter; label: string }[] = [
    { key: "all",       label: "Semua" },
    { key: "live",      label: "Live" },
    { key: "scheduled", label: "Terjadwal" },
    { key: "ended",     label: "Selesai" },
  ]

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Jadwal Show</h1>
        <p className="text-sm text-muted-foreground">
          Theater &amp; IDN Live Plus — JKT48
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-border gap-5">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              filter === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.key !== "all" && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({shows.filter(s => s.status === t.key).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground text-sm">
          Tidak ada show untuk kategori ini.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(show => (
            <ShowCard key={show.slug} show={show} />
          ))}
        </div>
      )}
    </div>
  )
}

function ShowCard({ show }: { show: Show }) {
  const [imgError, setImgError] = useState(false)
  const desc = show.idnliveplus?.description ?? ""
  const price = show.idnliveplus?.liveroom_price

  return (
    <div className="group relative flex flex-col rounded-xl border border-border bg-background overflow-hidden transition-shadow hover:shadow-md">

      {/* Thumbnail */}
      <div className="relative h-48 bg-muted overflow-hidden">
        {!imgError ? (
          <img
            src={show.image_url}
            alt={show.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-muted">
            <svg className="h-10 w-10 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.362a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
          </div>
        )}

        {/* Status badge overlay */}
        <div className="absolute top-2.5 left-2.5">
          <StatusBadge status={show.status} />
        </div>

        {/* Price badge */}
        {price != null && (
          <div className="absolute top-2.5 right-2.5 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
            {price} gold
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4 space-y-3">

        {/* Title */}
        <h3 className="font-semibold text-sm leading-snug line-clamp-2">{show.title}</h3>

        {/* Show ID + type */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="rounded bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
            {show.showId}
          </span>
          <span className="text-xs text-muted-foreground capitalize">
            {show.live_type === "idnliveplus" ? "IDN Live Plus" : show.live_type}
          </span>
        </div>

        {/* Schedule info */}
        <div className="space-y-1.5">
          {show.scheduled_at > 0 && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{formatDate(show.scheduled_at)}</span>
            </div>
          )}
          {show.scheduled_at > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{formatTime(show.scheduled_at)}</span>
            </div>
          )}
          {show.live_at > 0 && show.status === "live" && (
            <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <span>Mulai {formatTime(show.live_at)}</span>
            </div>
          )}
        </div>

        {/* Description */}
        {desc && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 whitespace-pre-line">
            {desc.trim()}
          </p>
        )}

        {/* EXP info */}
        {show.idnliveplus?.exp != null && (
          <div className="mt-auto pt-2 flex items-center gap-1.5 text-xs text-muted-foreground border-t border-border">
            <svg className="h-3.5 w-3.5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <span>{show.idnliveplus.exp.toLocaleString("id-ID")} EXP</span>
          </div>
        )}
      </div>
    </div>
  )
}
