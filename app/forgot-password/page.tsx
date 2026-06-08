// app/forgot-password/page.tsx
import { ForgotPasswordForm } from "./forgot-password-form"

export default function ForgotPasswordPage() {
  return (
    <div className="container relative sm:grid h-screen flex-col items-center justify-center md:grid lg:max-w-none lg:grid-cols-2 lg:px-0">
      {/* Kolom kiri — hero */}
      <div className="relative hidden h-full flex-col bg-muted p-10 text-white dark:border-r lg:flex">
        <div className="absolute inset-0 bg-black" />

        {/* Logo */}
        <div className="relative z-20 flex items-center gap-2 text-lg font-medium">
          <svg
            viewBox="0 0 32 32"
            fill="none"
            className="h-8 w-8"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="32" height="32" rx="8" fill="#e94560" />
            <text
              x="50%"
              y="54%"
              dominantBaseline="middle"
              textAnchor="middle"
              fill="white"
              fontSize="13"
              fontWeight="700"
              fontFamily="monospace"
            >
              T48
            </text>
          </svg>
          <span className="font-bold tracking-tight">T48ID</span>
        </div>

        {/* Center content */}
        <div className="relative z-20 m-auto max-w-sm text-center space-y-8">
          <div className="space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
              <svg
                className="h-8 w-8 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                />
              </svg>
            </div>
            <p className="text-lg font-medium leading-relaxed">
              Jangan khawatir, kami akan bantu kamu mendapatkan kembali akses ke akun T48ID.
            </p>
            <p className="text-sm text-white/60 leading-relaxed">
              Masukkan email yang terdaftar dan kami akan mengirimkan link reset password dalam beberapa menit.
            </p>
          </div>

          <div className="space-y-3 text-left">
            {[
              "Link reset berlaku selama 1 jam",
              "Cek folder spam jika email tidak masuk",
              "Satu link hanya bisa digunakan sekali",
            ].map((tip) => (
              <div key={tip} className="flex items-start gap-2.5 text-sm text-white/70">
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0 text-[#e94560]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {tip}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-20 text-xs text-white/40 text-center">
          &copy; {new Date().getFullYear()} T48ID. All rights reserved.
        </div>
      </div>

      {/* Kolom kanan — form */}
      <div className="flex h-screen items-center justify-center p-8">
        <ForgotPasswordForm />
      </div>
    </div>
  )
}
