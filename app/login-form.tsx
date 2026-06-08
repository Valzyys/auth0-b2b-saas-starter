"use client"

import { useState } from "react"
import Link from "next/link"
import Cookies from "js-cookie"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/submit-button"

const API_BASE = "https://v5.jkt48connect.com/api/team48"
const API_KEY = "JKTCONNECT"

export function LoginForm() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    login: "",
    password: "",
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }))
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`${API_BASE}/auth/login?apikey=${API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login: formData.login.trim(),
          password: formData.password,
        }),
      })

      const data = await res.json()

      if (!data.status) {
        if (data.is_banned) {
          setError(data.message || "Akun kamu dibanned.")
          return
        }
        if (res.status === 429) {
          setError(data.message || "Akun terkunci sementara. Coba lagi nanti.")
          return
        }
        if (data.attempts_remaining !== undefined) {
          setError(
            `${data.message} (${data.attempts_remaining} percobaan tersisa)`
          )
          return
        }
        setError(data.message || "Login gagal")
        return
      }

      const { access_token, refresh_token, expires_in } = data.data.tokens
      const user = data.data.user

      // Simpan ke cookie agar bisa dibaca server components
      // access_token: sesuai TTL dari API (default 15 menit)
      const accessExpiresDays = (expires_in ?? 900) / 86400
      Cookies.set("t48_access_token", access_token, {
        expires: accessExpiresDays,
        sameSite: "lax",
        path: "/",
      })
      // refresh_token: 30 hari
      Cookies.set("t48_refresh_token", refresh_token, {
        expires: 30,
        sameSite: "lax",
        path: "/",
      })
      // user info (non-sensitif, untuk client-side display)
      Cookies.set("t48_user", JSON.stringify(user), {
        expires: 30,
        sameSite: "lax",
        path: "/",
      })

      // Bersihkan localStorage lama jika ada
      localStorage.removeItem("t48_access_token")
      localStorage.removeItem("t48_refresh_token")
      localStorage.removeItem("t48_user")

      window.location.href = "/dashboard"
    } catch {
      setError("Terjadi kesalahan jaringan. Coba lagi.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full w-full items-start justify-center overflow-y-auto py-8 lg:items-center">
      <div className="w-full max-w-sm px-4">
        <div className="mb-6 flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Masuk ke JKT48Connect
          </h1>
          <p className="text-sm text-muted-foreground">
            Masukkan username, email, atau ID akun dan password kamu.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="login">Username / Email / ID Akun</Label>
              <Input
                id="login"
                name="login"
                type="text"
                placeholder="jkt48fan / name@example.com / 1234"
                value={formData.login}
                onChange={handleChange}
                required
                autoComplete="username"
              />
            </div>

            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-muted-foreground underline underline-offset-4 hover:text-primary"
                >
                  Lupa password?
                </Link>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Password kamu"
                value={formData.password}
                onChange={handleChange}
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive text-center">
                {error}
              </p>
            )}

            <SubmitButton disabled={loading} className="mt-1">
              {loading ? "Masuk..." : "Masuk"}
            </SubmitButton>
          </div>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Belum punya akun?{" "}
          <Link
            href="/register"
            className="underline underline-offset-4 hover:text-primary"
          >
            Daftar sekarang
          </Link>
        </p>
      </div>
    </div>
  )
}
