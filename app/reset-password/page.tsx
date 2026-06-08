"use client"

import { useState } from "react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const API_BASE = "https://v5.jkt48connect.com/api/team48"
const API_KEY  = "JKTCONNECT"

export default function ResetPasswordPage() {
  const [password, setPassword]     = useState("")
  const [confirm, setConfirm]       = useState("")
  const [loading, setLoading]       = useState(false)
  const [status, setStatus]         = useState<"idle" | "success" | "error">("idle")
  const [message, setMessage]       = useState("")
  const [showPass, setShowPass]     = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password.length < 8) {
      setStatus("error")
      setMessage("Password minimal 8 karakter.")
      return
    }
    if (password !== confirm) {
      setStatus("error")
      setMessage("Password dan konfirmasi tidak cocok.")
      return
    }

    const params = new URLSearchParams(window.location.search)
    const token  = params.get("token")
    const email  = params.get("email")

    if (!token || !email) {
      setStatus("error")
      setMessage("Link reset tidak valid atau sudah kadaluarsa.")
      return
    }

    setLoading(true)
    setMessage("")

    try {
      const res = await fetch(`${API_BASE}/auth/reset-password?apikey=${API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email, new_password: password }),
      })
      const data = await res.json()

      if (data.status) {
        setStatus("success")
        setMessage(data.message || "Password berhasil direset!")
      } else {
        setStatus("error")
        setMessage(data.message || "Gagal mereset password.")
      }
    } catch {
      setStatus("error")
      setMessage("Terjadi kesalahan jaringan. Coba lagi.")
    } finally {
      setLoading(false)
    }
  }

  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Password Berhasil Direset!</h1>
            <p className="text-muted-foreground text-sm">{message}</p>
          </div>
          <Link
            href="/login"
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Masuk dengan Password Baru
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Buat Password Baru</h1>
          <p className="text-sm text-muted-foreground">
            Masukkan password baru untuk akun JKT48Connect kamu.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="password">Password Baru</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPass ? "text" : "password"}
                placeholder="Minimal 8 karakter"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPass ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="confirm">Konfirmasi Password</Label>
            <Input
              id="confirm"
              type={showPass ? "text" : "password"}
              placeholder="Ulangi password baru"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>

          {/* Password strength indicator */}
          {password.length > 0 && (
            <div className="space-y-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      password.length >= i * 3
                        ? password.length >= 12
                          ? "bg-green-500"
                          : password.length >= 8
                          ? "bg-yellow-500"
                          : "bg-red-500"
                        : "bg-muted"
                    }`}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {password.length < 8
                  ? "Terlalu pendek"
                  : password.length < 12
                  ? "Cukup kuat"
                  : "Sangat kuat"}
              </p>
            </div>
          )}

          {confirm.length > 0 && password !== confirm && (
            <p className="text-xs text-destructive">Password tidak cocok.</p>
          )}

          {status === "error" && (
            <p className="text-sm text-destructive text-center">{message}</p>
          )}

          <button
            type="submit"
            disabled={loading || password !== confirm || password.length < 8}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Menyimpan..." : "Simpan Password Baru"}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Ingat password lama?{" "}
          <Link href="/login" className="underline underline-offset-4 hover:text-primary">
            Masuk
          </Link>
        </p>
      </div>
    </div>
  )
}
