"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

const API_BASE = "https://v5.jkt48connect.com/api/team48"
const API_KEY = "JKTCONNECT"

type User = {
  user_id: string
  account_id: string
  username: string
  email: string
  full_name: string | null
  avatar: string | null
  role: string
  membership_type: string
  membership_expired_at: string | null
  is_verified: boolean
  referral_code: string | null
}

export default function DashboardHome() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const raw = localStorage.getItem("t48_user")
    const token = localStorage.getItem("t48_access_token")
    if (!raw || !token) {
      router.replace("/login")
      return
    }
    const u = JSON.parse(raw) as User
    setUser(u)

    // Fetch fresh profile dari API
    fetch(`${API_BASE}/profile/me?apikey=${API_KEY}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.status) {
          setProfile(data.data)
          localStorage.setItem("t48_user", JSON.stringify(data.data))
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [router])

  if (loading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground text-sm">Memuat dashboard...</p>
      </div>
    )
  }

  const u = profile || user
  const isActive =
    u.membership_type !== "free" &&
    u.membership_expired_at &&
    new Date(u.membership_expired_at) > new Date()

  const daysRemaining = isActive
    ? Math.ceil(
        (new Date(u.membership_expired_at).getTime() - Date.now()) /
          86400000
      )
    : 0

  return (
    <div className="flex flex-1 flex-grow flex-col gap-4 lg:gap-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Halo, {u.full_name || u.username} 👋
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          ID Akun: <span className="font-mono font-medium">{u.account_id}</span>
          {u.referral_code && (
            <>
              {" "}· Kode Referral:{" "}
              <span className="font-mono font-medium">{u.referral_code}</span>
            </>
          )}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Membership
          </p>
          <p className="mt-1 text-xl font-semibold capitalize">
            {u.membership_type}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {isActive ? `${daysRemaining} hari tersisa` : "Tidak aktif"}
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Role
          </p>
          <p className="mt-1 text-xl font-semibold capitalize">{u.role}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Level akun kamu
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Status Email
          </p>
          <p className="mt-1 text-xl font-semibold">
            {u.is_verified ? "Verified" : "Unverified"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {u.is_verified ? "Email terverifikasi" : "Cek inbox kamu"}
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Expired
          </p>
          <p className="mt-1 text-xl font-semibold">
            {isActive
              ? new Date(u.membership_expired_at!).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {isActive ? "Tanggal berakhir" : "Belum berlangganan"}
          </p>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 items-center justify-center rounded-3xl border bg-muted/30 shadow-sm">
        <div className="flex max-w-[480px] flex-col items-center gap-1 text-center p-8">
          {!isActive ? (
            <>
              <h3 className="text-2xl font-bold tracking-tight">
                Upgrade Membership Kamu
              </h3>
              <p className="mt-3 text-muted-foreground text-sm">
                Nikmati akses penuh ke live streaming JKT48, konten eksklusif,
                dan fitur premium lainnya dengan berlangganan membership.
              </p>
              <a
                href="/dashboard/membership"
                className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Lihat Paket Membership →
              </a>
            </>
          ) : (
            <>
              <h3 className="text-2xl font-bold tracking-tight">
                Membership Aktif 🎉
              </h3>
              <p className="mt-3 text-muted-foreground text-sm">
                Kamu memiliki akses penuh ke semua konten JKT48Connect.
                Membership{" "}
                <span className="font-medium capitalize text-foreground">
                  {u.membership_type}
                </span>{" "}
                kamu aktif hingga{" "}
                {new Date(u.membership_expired_at!).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
                .
              </p>
              <a
                href="/live"
                className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Tonton Live Sekarang →
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
