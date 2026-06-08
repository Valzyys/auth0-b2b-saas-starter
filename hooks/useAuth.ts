"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

const API_BASE = "https://v5.jkt48connect.com/api/team48"
const API_KEY = "JKTCONNECT"

export type User = {
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
  whatsapp?: string | null
  membership_active?: boolean
}

// Helper baca cookie native
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
  if (!match) return null
  try {
    return decodeURIComponent(match.split("=").slice(1).join("="))
  } catch {
    return match.split("=").slice(1).join("=")
  }
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date()
  expires.setDate(expires.getDate() + days)
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`
}

function removeCookie(name: string) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
}

export function useAuth() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getCookie("t48_access_token")
    const raw = getCookie("t48_user")

    if (!token || !raw) {
      setLoading(false)
      router.replace("/login")
      return
    }

    let parsed: User
    try {
      parsed = JSON.parse(raw) as User
    } catch {
      setLoading(false)
      router.replace("/login")
      return
    }

    // Tampilkan dari cache dulu
    setUser(parsed)
    setLoading(false)

    // Refresh profile di background
    fetch(`${API_BASE}/profile/me?apikey=${API_KEY}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.status) {
          setUser(data.data)
          setCookie("t48_user", JSON.stringify(data.data), 30)
        }
        // Gagal fetch = biarkan pakai cache, jangan redirect
      })
      .catch(() => {})
  }, [router])

  function logout() {
    const token = getCookie("t48_access_token")
    if (token) {
      fetch(`${API_BASE}/auth/logout?apikey=${API_KEY}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }).catch(() => {})
    }
    removeCookie("t48_access_token")
    removeCookie("t48_refresh_token")
    removeCookie("t48_user")
    router.replace("/login")
  }

  return { user, loading, logout }
}
