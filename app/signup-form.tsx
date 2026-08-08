"use client"

import Link from "next/link"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/submit-button"

const API_BASE = "https://v3.jkt48connect.com/api/team48"
const API_KEY = "JKTCONNECT"

export function SignUpForm() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    full_name: "",
    whatsapp: "",
    referred_by: "",
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }))
    setError(null)
    setSuccess(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(`${API_BASE}/auth/register?apikey=${API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: formData.username,
          email: formData.email,
          password: formData.password,
          full_name: formData.full_name || undefined,
          whatsapp: formData.whatsapp || undefined,
          referred_by: formData.referred_by || undefined,
        }),
      })

      const data = await res.json()

      if (!data.status) {
        setError(data.message || "Registrasi gagal")
        return
      }

      setSuccess(data.message || "Registrasi berhasil!")
      setFormData({ username: "", email: "", password: "", full_name: "", whatsapp: "", referred_by: "" })
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
            Daftar ke T48ID
          </h1>
          <p className="text-sm text-muted-foreground">
            Buat akun untuk menikmati layanan live streaming, tiket, dan membership JKT48.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                type="text"
                placeholder="jkt48fan"
                value={formData.username}
                onChange={handleChange}
                required
                minLength={3}
                maxLength={20}
                pattern="[a-zA-Z0-9_]+"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="name@example.com"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Minimal 8 karakter"
                value={formData.password}
                onChange={handleChange}
                required
                minLength={8}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="full_name">
                Nama Lengkap{" "}
                <span className="text-muted-foreground text-xs">(opsional)</span>
              </Label>
              <Input
                id="full_name"
                name="full_name"
                type="text"
                placeholder="Nama kamu"
                value={formData.full_name}
                onChange={handleChange}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="whatsapp">
                WhatsApp{" "}
                <span className="text-muted-foreground text-xs">(opsional)</span>
              </Label>
              <Input
                id="whatsapp"
                name="whatsapp"
                type="tel"
                placeholder="08xxxxxxxxxx"
                value={formData.whatsapp}
                onChange={handleChange}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="referred_by">
                Kode Referral{" "}
                <span className="text-muted-foreground text-xs">(opsional)</span>
              </Label>
              <Input
                id="referred_by"
                name="referred_by"
                type="text"
                placeholder="T48XXXXX"
                value={formData.referred_by}
                onChange={handleChange}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}

            {success && (
              <p className="text-sm text-green-600 text-center">{success}</p>
            )}

            <SubmitButton disabled={loading} className="mt-1">
              {loading ? "Mendaftar..." : "Daftar Sekarang"}
            </SubmitButton>
          </div>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Sudah punya akun?{" "}
          <Link href="/login" className="underline underline-offset-4 hover:text-primary">
            Masuk
          </Link>
        </p>

        <p className="mt-3 px-4 text-center text-sm text-muted-foreground">
          Dengan mendaftar, kamu menyetujui{" "}
          <Link href="/term" className="underline underline-offset-4 hover:text-primary">
            Syarat & Ketentuan
          </Link>{" "}
          dan{" "}
          <Link href="/privac" className="underline underline-offset-4 hover:text-primary">
            Kebijakan Privasi
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
