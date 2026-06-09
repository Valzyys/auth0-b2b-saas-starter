import { appClient } from "@/lib/auth0"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { SignUpForm } from "./signup-form"
import { WelcomeBackCard } from "./welcome-back-card"
import { SubmitButton } from "@/components/submit-button"

export default async function Home() {
  // Cek cookie T48ID
  const cookieStore = cookies()
  const accessToken = cookieStore.get("t48_access_token")

  if (accessToken) {
    redirect("/dashboard")
  }

  // Fallback: cek Auth0 session juga
  const session = await appClient.getSession()
  if (session) {
    redirect("/dashboard")
  }

  return (
    <div className="container relative sm:grid h-screen flex-col items-center justify-center md:grid lg:max-w-none lg:grid-cols-2 lg:px-0">
      <div className="relative hidden h-full flex-col bg-muted p-10 text-white dark:border-r lg:flex">
        <div className="absolute inset-0 bg-black" />
        <div className="relative z-20 flex items-center text-lg font-medium">
          <span className="font-semibold">T48ID</span>
        </div>
        <div className="relative z-20 m-auto max-w-sm text-center">
          <blockquote className="space-y-2">
            <div className="space-y-8">
              <p className="text-lg font-medium">
                T48ID adalah platform terbaik untuk menonton dan membeli tiket live stream theater JKT48.
              </p>
              <p className="text-lg">
                Nikmati pertunjukan theater JKT48 favorit kamu dengan kualitas streaming terbaik, kapan saja dan di mana saja.
              </p>
            </div>
          </blockquote>
        </div>
      </div>
      <div className="lg:p-8 flex h-screen">
        <SignUpForm />
      </div>
    </div>
  )
}
