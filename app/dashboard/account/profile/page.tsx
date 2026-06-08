"use client"

import { useAuth } from "@/hooks/useAuth"
import { PageHeader } from "@/components/page-header"
import { ProfileForm } from "./profile-form"

export default function ProfilePage() {
  const { user, loading } = useAuth()

  if (loading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground animate-pulse">Memuat profil...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Profile"
        description="Kelola informasi pribadi kamu."
      />
      <ProfileForm user={user} />
    </div>
  )
}
