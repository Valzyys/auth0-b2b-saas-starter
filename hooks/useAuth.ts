"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"

const API_BASE = "https://v3.jkt48connect.com/api/team48"
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

// ── Cookie helpers ────────────────────────────────────────────
export function getCookie(name: string): string | null {
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

export function setCookie(name: string, value: string, days: number) {
  const expires = new Date()
  expires.setDate(expires.getDate() + days)
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`
}

export function removeCookie(name: string) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
}

// ── JWT decode (tanpa verify, hanya baca payload) ─────────────
function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const base64 = token.split(".")[1]
    const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/"))
    return JSON.parse(json)
  } catch {
    return null
  }
}

// Cek apakah token akan expired dalam X detik ke depan
function isTokenExpiredOrSoon(token: string, bufferSeconds = 60): boolean {
  const payload = decodeJwtPayload(token)
  if (!payload?.exp) return true
  const now = Math.floor(Date.now() / 1000)
  return payload.exp - now < bufferSeconds
}

// ── Refresh token ─────────────────────────────────────────────
async function doRefreshToken(): Promise<string | null> {
  const refreshToken = getCookie("t48_refresh_token")
  if (!refreshToken) return null

  try {
    const res = await fetch(`${API_BASE}/auth/refresh?apikey=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    const data = await res.json()
    if (!data.status) return null

    const { access_token, refresh_token, expires_in } = data.data
    // access token: simpan 1 hari di cookie (refresh dilakukan sebelum expired via buffer)
    setCookie("t48_access_token", access_token, 1)
    setCookie("t48_refresh_token", refresh_token, 30)
    return access_token
  } catch {
    return null
  }
}

// ── getValidToken: ambil token valid, auto-refresh jika perlu ─
export async function getValidToken(): Promise<string | null> {
  let token = getCookie("t48_access_token")

  if (!token) {
    // Tidak ada token sama sekali, coba refresh
    token = await doRefreshToken()
    return token
  }

  if (isTokenExpiredOrSoon(token, 60)) {
    // Token expired atau akan expired dalam 60 detik — refresh dulu
    const newToken = await doRefreshToken()
    return newToken ?? null
  }

  return token
}

// ── fetchWithAuth: fetch dengan auto-refresh ──────────────────
export async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getValidToken()
  if (!token) throw new Error("No valid token")

  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  })
}

// ── useAuth hook ──────────────────────────────────────────────
export function useAuth() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const clearAndRedirect = useCallback(() => {
    removeCookie("t48_access_token")
    removeCookie("t48_refresh_token")
    removeCookie("t48_user")
    router.replace("/login")
  }, [router])

  useEffect(() => {
    async function init() {
      // Cek cookie user dulu untuk tampil cepat
      const raw = getCookie("t48_user")
      if (raw) {
        try {
          setUser(JSON.parse(raw) as User)
          setLoading(false)
        } catch (_) {}
      }

      // Pastikan ada token valid (auto-refresh jika perlu)
      const token = await getValidToken()
      if (!token) {
        clearAndRedirect()
        return
      }

      // Fetch fresh profile
      try {
        const res = await fetch(`${API_BASE}/profile/me?apikey=${API_KEY}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()

        if (data.status) {
          setUser(data.data)
          setCookie("t48_user", JSON.stringify(data.data), 30)
        } else if (res.status === 401) {
          // Token benar-benar tidak valid
          clearAndRedirect()
          return
        }
        // error lain (500, network) = biarkan pakai cache
      } catch (_) {
        // Network error = biarkan pakai cache
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [clearAndRedirect])

  function logout() {
    const token = getCookie("t48_access_token")
    const refreshToken = getCookie("t48_refresh_token")
    if (token) {
      fetch(`${API_BASE}/auth/logout?apikey=${API_KEY}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }).catch(() => {})
    }
    removeCookie("t48_access_token")
    removeCookie("t48_refresh_token")
    removeCookie("t48_user")
    router.replace("/login")
  }

  return { user, loading, logout }
}
