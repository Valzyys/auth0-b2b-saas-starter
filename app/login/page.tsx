import { appClient } from "@/lib/auth0"
import { Auth0Logo } from "@/components/auth0-logo"
import { LoginForm } from "../login-form"
import { redirect } from "next/navigation"

export default async function LoginPage() {
  const session = await appClient.getSession()
  if (session) redirect("/dashboard")

  return (
    <div className="container relative sm:grid h-screen flex-col items-center justify-center md:grid lg:max-w-none lg:grid-cols-2 lg:px-0">
      <div className="relative hidden h-full flex-col bg-muted p-10 text-white dark:border-r lg:flex">
        <div className="absolute inset-0 bg-black" />
        <div className="relative z-20 flex items-center text-lg font-medium">
          <Auth0Logo className="mr-2 size-8" />
          <span className="font-semibold">SaaStart</span>
        </div>
        <div className="relative z-20 m-auto max-w-sm text-center">
          <blockquote className="space-y-2">
            <div className="space-y-8">
              <p className="text-lg font-medium">
                SaaStart adalah referensi aplikasi B2B SaaS yang dibangun
                menggunakan Next.js dan Auth0 by Okta.
              </p>
              <p className="text-lg">
                Mendukung multi-tenancy, manajemen pengguna, kontrol akses,
                kebijakan keamanan, dan konfigurasi SSO mandiri.
              </p>
            </div>
          </blockquote>
        </div>
      </div>
      <div className="lg:p-8 flex h-screen">
        <LoginForm />
      </div>
    </div>
  )
}
