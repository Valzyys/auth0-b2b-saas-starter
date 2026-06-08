"use client"

import { useAuth } from "@/hooks/useAuth"
import { PageHeader } from "@/components/page-header"
import { DeleteAccountForm } from "./delete-account-form"
import { DisplayNameForm } from "./display-name-form"

export default function Profile() {
  const { user, loading } = useAuth()

  if (loading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground text-sm">Memuat profil...</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <PageHeader
        title="Profile"
        description="Manage your personal information."
      />
      <DisplayNameForm displayName={user.full_name ?? user.username ?? ""} />
      <DeleteAccountForm />
    </div>
  )
}
