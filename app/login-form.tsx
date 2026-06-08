"use client"

import { useState } from "react"
import Link from "next/link"
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
        // Handle ban
        if (data.is_banned) {
          setError(data.message || "Akun kamu dibanned.")
          return
        }
        // Handle locked
        if (res.status === 429) {
          setError(data.message || "Akun terkunci sementara. Coba lagi nanti.")
          return
        }
        // Sisa attempts info
        if (data.attempts_remaining !== undefined) {
          setError(
            `${data.message} (${data.attempts_remaining} percobaan tersisa)`
          )
          return
        }
        setError(data.message || "Login gagal")
        return
      }

      // Simpan tokens ke localStorage
      const { access_token, refresh_token } = data.data.tokens
      localStorage.setItem("t48_access_token", access_token)
      localStorage.setItem("t48_refresh_token", refresh_token)
      localStorage.setItem("t48_user", JSON.stringify(data.data.user))

      // Redirect ke dashboard
      window.location.href = "/dashboard"
    } catch {
      setError("Terjadi kesalahan. Coba lagi.")
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
              <p className="text-sm text-destructive text-center">{error}</p>
            )}

            <SubmitButton disabled={loading} className="mt-1">
              {loading ? "Masuk..." : "Masuk"}
            </SubmitButton>
          </div>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Belum punya akun?{" "}
          <Link
            href="/"
            className="underline underline-offset-4 hover:text-primary"
          >
            Daftar sekarang
          </Link>
        </p>
      </div>
    </div>
  )
}
