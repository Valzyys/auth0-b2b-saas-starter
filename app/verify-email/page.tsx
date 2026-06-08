"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

const API_BASE = "https://v5.jkt48connect.com/api/team48"
const API_KEY  = "JKTCONNECT"

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
  const [message, setMessage] = useState("")

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token  = params.get("token")
    const email  = params.get("email")

    if (!token || !email) {
      setStatus("error")
      setMessage("Link verifikasi tidak valid.")
      return
    }

    fetch(`${API_BASE}/auth/verify-email?apikey=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, email }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.status) {
          setStatus("success")
          setMessage(data.message || "Email berhasil diverifikasi!")
        } else {
          setStatus("error")
          setMessage(data.message || "Verifikasi gagal.")
        }
      })
      .catch(() => {
        setStatus("error")
        setMessage("Terjadi kesalahan. Coba lagi.")
      })
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        {status === "loading" && (
          <>
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-muted border-t-primary" />
            <p className="text-muted-foreground text-sm">Memverifikasi email kamu...</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight">Email Terverifikasi!</h1>
              <p className="text-muted-foreground text-sm">{message}</p>
            </div>
            <Link
              href="/login"
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Masuk Sekarang
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight">Verifikasi Gagal</h1>
              <p className="text-muted-foreground text-sm">{message}</p>
            </div>
            <Link
              href="/"
              className="inline-flex h-10 w-full items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
              Kembali ke Beranda
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
