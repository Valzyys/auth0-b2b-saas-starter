import React from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/page-header"
import { DeleteAccountForm } from "./delete-account-form"
import { DisplayNameForm } from "./display-name-form"

const API_BASE = "https://v5.jkt48connect.com/api/team48"
const API_KEY = "JKTCONNECT"

async function getProfile(accessToken: string) {
  const res = await fetch(`${API_BASE}/profile/me?apikey=${API_KEY}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.status ? data.data : null
}

export default async function Profile() {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get("t48_access_token")?.value

  if (!accessToken) redirect("/auth/login")

  const profile = await getProfile(accessToken)
  if (!profile) redirect("/auth/login")

  return (
    <div className="space-y-2">
      <PageHeader
        title="Profile"
        description="Manage your personal information."
      />
      <DisplayNameForm displayName={profile.full_name ?? profile.username ?? ""} />
      <DeleteAccountForm />
    </div>
  )
}
