"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

const API_BASE = "https://v3.jkt48connect.com/api/team48"
const API_KEY = "JKTCONNECT"

export async function updateDisplayName(formData: FormData) {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get("t48_access_token")?.value

  if (!accessToken) return redirect("/login")

  const displayName = formData.get("display_name")
  if (!displayName || typeof displayName !== "string") {
    return { error: "Display name is required." }
  }

  try {
    const res = await fetch(`${API_BASE}/profile/update?apikey=${API_KEY}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ full_name: displayName.trim() }),
    })

    const data = await res.json()
    if (!data.status) {
      return { error: data.message || "Failed to update display name." }
    }

    // Update cookie t48_user dengan nama baru
    const rawUser = cookieStore.get("t48_user")?.value
    if (rawUser) {
      try {
        const user = JSON.parse(rawUser)
        cookieStore.set("t48_user", JSON.stringify({
          ...user,
          full_name: displayName.trim(),
        }), { path: "/", sameSite: "lax" })
      } catch (_) {}
    }

    revalidatePath("/", "layout")
    return {}
  } catch (error) {
    console.error("failed to update display name", error)
    return { error: "Failed to update your display name." }
  }
}

export async function deleteAccount() {
  return { error: "Fitur hapus akun belum tersedia. Hubungi admin." }
}
