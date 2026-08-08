"use client"

import { useEffect, useState, useCallback, useMemo } from "react"

// ─── API Constants ─────────────────────────────────────────
const MEMBERS_API = "https://v3.jkt48connect.com/api/jkt48/members"
const API_KEY      = "JKTCONNECT"

// ─── Types ─────────────────────────────────────────────────

interface SocialLink 
  title: string
  url:   string
}

interface Member {
  _id:           string
  name:          string
  img:           string
  img_alt:       string
  url:           string
  group:         string
  room_id:       number
  sr_exists:     boolean
  is_graduate:   boolean
  generation:    string
  idn_username:  string
  jkt48_id:      string
  team:          string
  nicknames:     string[]
  socials:       SocialLink[]
}

// ─── Helpers ───────────────────────────────────────────────

function formatGeneration(gen: string): string {
  if (!gen) return "—"
  const m = gen.match(/gen(\d+)/i)
  return m ? `Gen ${m[1]}` : gen
}

function normalizeTeamKey(team: string): string {
  return (team || "").trim().toLowerCase()
}

function teamLabel(team: string): string {
  const key = normalizeTeamKey(team)
  const map: Record<string, string> = {
    love:           "Team Love",
    passion:        "Team Passion",
    dream:          "Team Dream",
    trainee:        "Trainee",
    jkt48_virtual:  "JKT48 Virtual",
  }
  if (map[key]) return map[key]
  if (!team) return "—"
  return team
    .split("_")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}

function teamColorClass(team: string): string {
  const key = normalizeTeamKey(team)
  const map: Record<string, string> = {
    love:          "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
    passion:       "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
    dream:         "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    trainee:       "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    jkt48_virtual: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  }
  return map[key] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
}

function socialAbbrev(title: string): string {
  const key = title.trim().toLowerCase()
  const map: Record<string, string> = {
    x: "X", twitter: "X", instagram: "IG", tiktok: "TT",
    showroom: "SR", idn: "IDN",
  }
  return map[key] ?? title.slice(0, 2).toUpperCase()
}

function socialColorClass(title: string): string {
  const key = title.trim().toLowerCase()
  const map: Record<string, string> = {
    x:         "bg-black text-white hover:bg-black/80",
    twitter:   "bg-black text-white hover:bg-black/80",
    instagram: "bg-gradient-to-br from-pink-500 to-orange-400 text-white hover:opacity-90",
    tiktok:    "bg-foreground text-background hover:opacity-80",
    showroom:  "bg-orange-500 text-white hover:bg-orange-600",
    idn:       "bg-blue-600 text-white hover:bg-blue-700",
  }
  return map[key] ?? "bg-muted text-muted-foreground hover:bg-muted/80"
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join("")
    .toUpperCase()
}

// ─── Sub-components ────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden animate-pulse">
      <div className="h-56 bg-muted" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-3 bg-muted rounded w-1/2" />
        <div className="flex gap-1.5 mt-2">
          <div className="h-6 w-10 bg-muted rounded-full" />
          <div className="h-6 w-10 bg-muted rounded-full" />
          <div className="h-6 w-10 bg-muted rounded-full" />
        </div>
      </div>
    </div>
  )
}

function MemberCard({ member }: { member: Member }) {
  const [imgError, setImgError] = useState(false)

  return (
    <div className="group flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">

      {/* Photo */}
      <div className="relative h-56 overflow-hidden bg-muted shrink-0">
        {!imgError && member.img ? (
          <img
            src={member.img}
            alt={member.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-md bg-muted-foreground/10 text-lg font-bold text-muted-foreground/50">
              {getInitials(member.name)}
            </span>
          </div>
        )}

        {member.generation && (
          <div className="absolute top-2.5 left-2.5 rounded-full bg-black/70 px-2.5 py-0.5 text-xs font-medium text-white">
            {formatGeneration(member.generation)}
          </div>
        )}

        {member.is_graduate && (
          <div className="absolute top-2.5 right-2.5 rounded-full bg-gray-700/80 px-2.5 py-0.5 text-xs font-medium text-white">
            Graduate
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <h3 className="font-semibold text-sm leading-snug text-foreground line-clamp-1">
            {member.name}
          </h3>
          {member.nicknames?.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {member.nicknames.join(" · ")}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${teamColorClass(member.team)}`}>
            {teamLabel(member.team)}
          </span>
        </div>

        {member.idn_username && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.362a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
            <span className="font-mono truncate">@{member.idn_username}</span>
          </div>
        )}

        {member.socials?.length > 0 && (
          <div className="mt-auto pt-2 flex items-center gap-1.5 flex-wrap">
            {member.socials.map(s => (
              <a
                key={s.title + s.url}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                title={s.title}
                className={`inline-flex h-6 min-w-[28px] items-center justify-center rounded-md px-1.5 text-[10px] font-bold transition-colors ${socialColorClass(s.title)}`}
              >
                {socialAbbrev(s.title)}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────

export default function MembersPage() {
  const [members, setMembers]   = useState<Member[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const [search, setSearch]               = useState("")
  const [teamFilter, setTeamFilter]       = useState("")
  const [genFilter, setGenFilter]         = useState("")
  const [showGraduate, setShowGraduate]   = useState(false)

  const fetchMembers = useCallback(() => {
    return fetch(`${MEMBERS_API}?apikey=${API_KEY}`)
      .then(r => r.json())
      .then(d => {
        const list: Member[] = Array.isArray(d) ? d : (d.data || [])
        if (list.length) setMembers(list)
        else setError("Gagal memuat data member.")
      })
      .catch(() => setError("Terjadi kesalahan jaringan."))
  }, [])

  useEffect(() => {
    fetchMembers().finally(() => setLoading(false))
  }, [fetchMembers])

  // ─ Derive filter options ──────────────────────────────────
  const teamOptions = useMemo(() => {
    const seen = new Map<string, string>()
    members.forEach(m => {
      const key = normalizeTeamKey(m.team)
      if (key && !seen.has(key)) seen.set(key, teamLabel(m.team))
    })
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [members])

  const generationOptions = useMemo(() => {
    const seen = new Set<string>()
    members.forEach(m => { if (m.generation) seen.add(m.generation) })
    return Array.from(seen).sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] ?? "0", 10)
      const nb = parseInt(b.match(/\d+/)?.[0] ?? "0", 10)
      return na - nb
    })
  }, [members])

  // ─ Apply filters ──────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return members
      .filter(m => showGraduate || !m.is_graduate)
      .filter(m => !teamFilter || normalizeTeamKey(m.team) === teamFilter)
      .filter(m => !genFilter || m.generation === genFilter)
      .filter(m => {
        if (!q) return true
        const haystack = [
          m.name,
          m.idn_username,
          ...(m.nicknames ?? []),
        ].join(" ").toLowerCase()
        return haystack.includes(q)
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [members, search, teamFilter, genFilter, showGraduate])

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Member JKT48</h1>
        <p className="text-sm text-muted-foreground">
          Daftar lengkap member JKT48 — profil, team, generasi, dan tautan sosial media
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama atau nickname member..."
            className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <select
          value={teamFilter}
          onChange={e => setTeamFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Semua Team</option>
          {teamOptions.map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        <select
          value={genFilter}
          onChange={e => setGenFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Semua Generasi</option>
          {generationOptions.map(g => (
            <option key={g} value={g}>{formatGeneration(g)}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={showGraduate}
            onChange={e => setShowGraduate(e.target.checked)}
            className="rounded"
          />
          Tampilkan Graduate
        </label>
      </div>

      {/* Result count */}
      {!loading && !error && (
        <p className="text-xs text-muted-foreground">
          Menampilkan {filtered.length} dari {members.length} member
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground text-sm">
          Tidak ada member yang cocok dengan filter ini.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {filtered.map(m => (
            <MemberCard key={m.jkt48_id || m.url} member={m} />
          ))}
        </div>
      )}
    </div>
  )
}
