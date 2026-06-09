import { appClient } from "@/lib/auth0"
import { LoginForm } from "../login-form"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"

export default async function LoginPage() {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get("t48_access_token")
  if (accessToken) redirect("/dashboard")

  const session = await appClient.getSession()
  if (session) redirect("/dashboard")

  return (
    <div className="container relative sm:grid h-screen flex-col items-center justify-center md:grid lg:max-w-none lg:grid-cols-2 lg:px-0">
      <div className="relative hidden h-full flex-col bg-muted p-10 text-white dark:border-r lg:flex">
        <div className="absolute inset-0 bg-black" />
        <div className="relative z-20 flex items-center text-lg font-medium">
          <span className="font-semibold">T48ID</span>
        </div>
        <div className="relative z-20 m-auto max-w-sm text-center">
          <div className="space-y-8">
            <p className="text-lg font-medium">
              T48ID adalah platform terbaik untuk menonton dan membeli tiket live stream theater JKT48.
            </p>
            <p className="text-lg">
              Nikmati pertunjukan theater JKT48 favorit kamu dengan kualitas streaming terbaik, kapan saja dan di mana saja.
            </p>
          </div>
        </div>
      </div>
      <div className="lg:p-8 flex h-screen">
        <LoginForm />
      </div>
    </div>
  )
}
