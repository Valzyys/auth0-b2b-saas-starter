import Cookies from "js-cookie"

const API_BASE = "https://v3.jkt48connect.com/api/team48"
const API_KEY = "JKTCONNECT"

export function getAccessToken() {
  return Cookies.get("t48_access_token") ?? null
}

export function getRefreshToken() {
  return Cookies.get("t48_refresh_token") ?? null
}

export function getCachedUser() {
  const raw = Cookies.get("t48_user")
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearAuth() {
  Cookies.remove("t48_access_token", { path: "/" })
  Cookies.remove("t48_refresh_token", { path: "/" })
  Cookies.remove("t48_user", { path: "/" })
}

export function saveTokens(
  accessToken: string,
  refreshToken: string,
  user: object,
  expiresIn = 900
) {
  const accessExpiresDays = expiresIn / 86400
  Cookies.set("t48_access_token", accessToken, {
    expires: accessExpiresDays,
    sameSite: "lax",
    path: "/",
  })
  Cookies.set("t48_refresh_token", refreshToken, {
    expires: 30,
    sameSite: "lax",
    path: "/",
  })
  Cookies.set("t48_user", JSON.stringify(user), {
    expires: 30,
    sameSite: "lax",
    path: "/",
  })
}

export async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false

  try {
    const res = await fetch(`${API_BASE}/auth/refresh?apikey=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    const data = await res.json()
    if (!data.status) return false

    const { access_token, refresh_token, expires_in } = data.data
    const currentUser = getCachedUser()
    saveTokens(access_token, refresh_token, currentUser ?? {}, expires_in ?? 900)
    return true
  } catch {
    return false
  }
}

export async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getAccessToken()
  const res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  })

  // Kalau 401, coba refresh token lalu retry sekali
  if (res.status === 401) {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      const newToken = getAccessToken()
      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${newToken}`,
          "Content-Type": "application/json",
        },
      })
    }
  }

  return res
}
