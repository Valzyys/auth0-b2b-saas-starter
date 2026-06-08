"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  getAccessToken,
  getCachedUser,
  clearAuth,
  fetchWithAuth,
  saveTokens,
} from "@/lib/auth"

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

export function useAuth() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getAccessToken()
    const cached = getCachedUser()

    if (!token || !cached) {
      clearAuth()
      router.replace("/login")
      return
    }

    // Set dari cache dulu agar UI langsung tampil
    setUser(cached)
    setLoading(false)

    // Fetch fresh di background
    fetchWithAuth(`${API_BASE}/profile/me?apikey=${API_KEY}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.status) {
          setUser(data.data)
          // Update cookie user
          const currentToken = getAccessToken()!
          const raw = document.cookie
            .split("; ")
            .find((c) => c.startsWith("t48_refresh_token="))
            ?.split("=")[1] ?? ""
          saveTokens(currentToken, raw, data.data)
        } else {
          clearAuth()
          router.replace("/login")
        }
      })
      .catch(() => {
        // Gagal fetch tapi sudah ada cache — biarkan, tidak redirect
      })
  }, [router])

  function logout() {
    const token = getAccessToken()
    if (token) {
      fetch(`${API_BASE}/auth/logout?apikey=${API_KEY}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }).catch(() => {})
    }
    clearAuth()
    router.replace("/login")
  }

  return { user, loading, logout }
}
