import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { Auth0Logo } from "@/components/auth0-logo"
import { SignUpForm } from "./signup-form"
import { WelcomeBackCard } from "./welcome-back-card"
import { SubmitButton } from "@/components/submit-button"

export default async function Home() {
  // Hapus appClient.getSession() karena sudah tidak pakai Auth0
  // Ganti session dengan null atau state dari custom auth
  const session = null

  return (
    <div className="container relative sm:grid h-screen flex-col items-center justify-center md:grid lg:max-w-none lg:grid-cols-2 lg:px-0">
      {session ? (
        
          href="/auth/logout"
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "absolute right-4 top-4 md:right-8 md:top-8"
          )}
        >
          <SubmitButton>Logout</SubmitButton>
        </a>
      ) : (
        <div className="absolute right-4 top-4 md:right-8 md:top-8 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sudah punya akun?</span>
          <a href="/login">
            <SubmitButton>Log in</SubmitButton>
          </a>
        </div>
      )}

      {/* Kolom kiri — hero */}
      <div className="relative hidden h-full flex-col bg-muted p-10 text-white dark:border-r lg:flex">
        <div className="absolute inset-0 bg-black" />
        <div className="relative z-20 flex items-center text-lg font-medium">
          <Auth0Logo className="mr-2 size-8" />
          <span className="font-semibold">JKT48Connect</span>
        </div>
        <div className="relative z-20 m-auto max-w-sm text-center">
          <blockquote className="space-y-8">
            <p className="text-lg font-medium">
              Platform resmi fan JKT48 untuk live streaming, tiket theater, dan membership eksklusif.
            </p>
            <p className="text-lg">
              Nikmati akses ke konten JKT48 kapan saja dan di mana saja bersama komunitas penggemar terbesar.
            </p>
          </blockquote>
        </div>
      </div>

      {/* Kolom kanan — form */}
      <div className="flex h-screen items-center justify-center p-8">
        {session ? <WelcomeBackCard /> : <SignUpForm />}
      </div>
    </div>
  )
}
