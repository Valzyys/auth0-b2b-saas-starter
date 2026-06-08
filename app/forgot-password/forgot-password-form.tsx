// app/forgot-password/forgot-password-form.tsx
"use client"

import { useState } from "react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/submit-button"

const API_BASE = "https://v5.jkt48connect.com/api/team48"
const API_KEY  = "JKTCONNECT"

export function ForgotPasswordForm() {
  const [email, setEmail]     = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password?apikey=${API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })

      const data = await res.json()

      if (!data.status) {
        setError(data.message || "Terjadi kesalahan. Coba lagi.")
        return
      }

      // API selalu return status:true untuk prevent user enumeration
      setSent(true)
    } catch {
      setError("Terjadi kesalahan jaringan. Coba lagi.")
    } finally {
      setLoading(false)
    }
  }

  // ── Sukses state ──────────────────────────────────────────
  if (sent) {
    return (
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <svg
            className="h-8 w-8 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Cek email kamu</h1>
          <p className="text-sm text-muted-foreground">
            Jika <span className="font-medium text-foreground">{email}</span> terdaftar,
            link reset password sudah dikirim. Berlaku selama <strong>1 jam</strong>.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-left space-y-2">
          <p className="text-xs font-medium text-foreground">Tidak menerima email?</p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>· Cek folder <strong>Spam</strong> atau <strong>Promosi</strong></li>
            <li>· Pastikan email yang dimasukkan benar</li>
            <li>· Tunggu beberapa menit lalu coba lagi</li>
          </ul>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => { setSent(false); setEmail("") }}
            className="w-full rounded-md border border-input bg-background py-2.5 text-sm font-medium hover:bg-accent transition-colors"
          >
            Coba email lain
          </button>
          <Link
            href="/login"
            className="flex w-full items-center justify-center rounded-md py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Kembali ke halaman login
          </Link>
        </div>
      </div>
    )
  }

  // ── Form state ────────────────────────────────────────────
  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-2 text-center">
        {/* Mobile logo */}
        <div className="flex justify-center lg:hidden mb-4">
          <div className="flex items-center gap-2">
            <svg
              viewBox="0 0 32 32"
              fill="none"
              className="h-8 w-8"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect width="32" height="32" rx="8" fill="#e94560" />
              <text
                x="50%"
                y="54%"
                dominantBaseline="middle"
                textAnchor="middle"
                fill="white"
                fontSize="13"
                fontWeight="700"
                fontFamily="monospace"
              >
                T48
              </text>
            </svg>
            <span className="font-bold text-lg tracking-tight">T48ID</span>
          </div>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">Lupa Password?</h1>
        <p className="text-sm text-muted-foreground">
          Masukkan email yang terdaftar. Kami akan mengirimkan link untuk membuat password baru.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null) }}
            required
            autoComplete="email"
            autoFocus
          />
        </div>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive text-center">
            {error}
          </p>
        )}

        <SubmitButton disabled={loading || !email.trim()} className="w-full">
          {loading ? "Mengirim..." : "Kirim Link Reset"}
        </SubmitButton>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Ingat password kamu?{" "}
        <Link
          href="/login"
          className="underline underline-offset-4 hover:text-primary font-medium"
        >
          Masuk
        </Link>
      </p>

      <p className="text-center text-sm text-muted-foreground">
        Belum punya akun?{" "}
        <Link
          href="/register"
          className="underline underline-offset-4 hover:text-primary font-medium"
        >
          Daftar sekarang
        </Link>
      </p>
    </div>
  )
}
