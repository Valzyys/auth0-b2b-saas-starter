"use client"

import { useAuth } from "@/hooks/useAuth"

export default function DashboardHome() {
  const { user, loading } = useAuth()

  if (loading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground text-sm">Memuat dashboard...</p>
      </div>
    )
  }

  const isActive =
    user.membership_type !== "free" &&
    !!user.membership_expired_at &&
    new Date(user.membership_expired_at) > new Date()

  const daysRemaining = isActive
    ? Math.ceil(
        (new Date(user.membership_expired_at!).getTime() - Date.now()) /
          86400000
      )
    : 0

  return (
    <div className="flex flex-1 flex-grow flex-col gap-4 lg:gap-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Halo, {user.full_name || user.username} 👋
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          ID Akun:{" "}
          <span className="font-mono font-medium">{user.account_id}</span>
          {user.referral_code && (
            <>
              {" "}· Kode Referral:{" "}
              <span className="font-mono font-medium">
                {user.referral_code}
              </span>
            </>
          )}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Membership"
          value={user.membership_type}
          sub={isActive ? `${daysRemaining} hari tersisa` : "Tidak aktif"}
          capitalize
        />
        <StatCard
          label="Role"
          value={user.role}
          sub="Level akun kamu"
          capitalize
        />
        <StatCard
          label="Status Email"
          value={user.is_verified ? "Verified" : "Unverified"}
          sub={user.is_verified ? "Email terverifikasi" : "Cek inbox kamu"}
        />
        <StatCard
          label="Expired"
          value={
            isActive
              ? new Date(user.membership_expired_at!).toLocaleDateString(
                  "id-ID",
                  { day: "numeric", month: "short", year: "numeric" }
                )
              : "—"
          }
          sub={isActive ? "Tanggal berakhir" : "Belum berlangganan"}
        />
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
                Kamu memiliki akses penuh ke semua konten T48ID.
                Membership{" "}
                <span className="font-medium capitalize text-foreground">
                  {user.membership_type}
                </span>{" "}
                kamu aktif hingga{" "}
                {new Date(user.membership_expired_at!).toLocaleDateString(
                  "id-ID",
                  { day: "numeric", month: "long", year: "numeric" }
                )}
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

function StatCard({
  label,
  value,
  sub,
  capitalize = false,
}: {
  label: string
  value: string
  sub: string
  capitalize?: boolean
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-semibold ${capitalize ? "capitalize" : ""}`}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
    </div>
  )
}
