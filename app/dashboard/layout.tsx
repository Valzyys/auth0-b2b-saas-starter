"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { SettingsIcon } from "lucide-react"
import { Auth0Logo } from "@/components/auth0-logo"
import { ModeToggle } from "@/components/mode-toggle"
import { Button } from "@/components/ui/button"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const raw = localStorage.getItem("t48_user")
    const token = localStorage.getItem("t48_access_token")
    if (!raw || !token) {
      router.replace("/login")
      return
    }
    setUser(JSON.parse(raw))
  }, [router])

  const handleLogout = () => {
    localStorage.removeItem("t48_access_token")
    localStorage.removeItem("t48_refresh_token")
    localStorage.removeItem("t48_user")
    router.replace("/login")
  }

  if (!user) return null

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-2 py-4 sm:px-8">
        <div className="flex items-center space-x-6">
          <Link href="/dashboard" className="flex items-center space-x-2">
            <Auth0Logo className="h-6 w-6" />
            <span className="font-mono font-semibold">JKT48Connect</span>
          </Link>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Home
          </Link>
        </div>
        <div className="flex flex-row items-center gap-x-3">
          <ModeToggle />
          <Button variant="ghost" asChild className="px-2 py-2">
            <Link href="/dashboard/settings">
              <SettingsIcon className="h-[1.2rem] w-[1.2rem]" />
            </Link>
          </Button>
          <div className="flex items-center gap-x-3">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-sm font-medium leading-none">
                {user.full_name || user.username}
              </span>
              <span className="text-xs text-muted-foreground mt-1 capitalize">
                {user.membership_type} · {user.role}
              </span>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold uppercase">
              {(user.full_name || user.username)?.[0] ?? "U"}
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
      </nav>

      <main className="mx-auto grid min-h-[calc(100svh-164px)] w-full max-w-7xl px-2 sm:px-8 lg:py-6">
        {children}
      </main>

      <footer className="mx-auto w-full max-w-7xl px-2 py-6 sm:px-6 lg:px-8">
        <div className="flex justify-between">
          <div className="flex items-center space-x-2">
            <Auth0Logo className="h-6 w-6" />
            <div className="font-mono font-semibold">
              <Link href="/">JKT48Connect</Link>
            </div>
            <Button variant="link" asChild>
              <Link href="/">Home</Link>
            </Button>
          </div>
          <ModeToggle />
        </div>
      </footer>
    </div>
  )
}
