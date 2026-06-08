"use client"

import { useState, useRef } from "react"
import { toast } from "sonner"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { fetchWithAuth, getCookie, setCookie } from "@/hooks/useAuth"
import { User } from "@/hooks/useAuth"

const API_BASE = "https://v5.jkt48connect.com/api/team48"
const API_KEY = "JKTCONNECT"

interface Props {
  user: User
}

export function ProfileForm({ user }: Props) {
  const [loading, setLoading] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    user.avatar || null
  )
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null)
  const [avatarMime, setAvatarMime] = useState<string>("image/jpeg")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    full_name: user.full_name || "",
    whatsapp: user.whatsapp || "",
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Ukuran foto maksimal 2MB")
      return
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Format foto harus JPG, PNG, atau WebP")
      return
    }

    setAvatarMime(file.type)

    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = ev.target?.result as string
      setAvatarPreview(result)
      setAvatarBase64(result.split(",")[1])
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const body: Record<string, string> = {}
      if (form.full_name.trim()) body.full_name = form.full_name.trim()
      if (form.whatsapp.trim()) body.whatsapp = form.whatsapp.trim()
      if (avatarBase64) {
        body.avatar_base64 = avatarBase64
        body.avatar_mime = avatarMime
      }

      if (Object.keys(body).length === 0) {
        toast.error("Tidak ada perubahan yang disimpan")
        setLoading(false)
        return
      }

      const res = await fetchWithAuth(
        `${API_BASE}/profile/update?apikey=${API_KEY}`,
        { method: "PUT", body: JSON.stringify(body) }
      )
      const data = await res.json()

      if (!data.status) {
        toast.error(data.message || "Gagal memperbarui profil")
        return
      }

      // Update cookie t48_user
      const rawUser = getCookie("t48_user")
      if (rawUser) {
        try {
          const cached = JSON.parse(rawUser)
          setCookie(
            "t48_user",
            JSON.stringify({
              ...cached,
              full_name: data.data.full_name,
              whatsapp: data.data.whatsapp,
              avatar: data.data.avatar,
            }),
            30
          )
        } catch (_) {}
      }

      setAvatarBase64(null)
      if (data.data.avatar) setAvatarPreview(data.data.avatar)
      toast.success("Profil berhasil diperbarui!")
    } catch {
      toast.error("Terjadi kesalahan jaringan. Coba lagi.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Avatar */}
      <Card>
        <CardHeader>
          <CardTitle>Foto Profil</CardTitle>
          <CardDescription>
            Klik foto untuk menggantinya. Maks 2MB, format JPG/PNG/WebP.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={handleAvatarClick}
              className="relative group h-20 w-20 rounded-full overflow-hidden border-2 border-muted hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Avatar"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-primary text-primary-foreground text-2xl font-semibold uppercase">
                  {(user.full_name || user.username)?.[0] ?? "U"}
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-white text-xs font-medium">Ganti</span>
              </div>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />

            <div className="text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">
                {user.full_name || user.username}
              </p>
              <p>@{user.username}</p>
              <p className="capitalize">
                {user.role} · {user.membership_type}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info Dasar */}
      <Card>
        <CardHeader>
          <CardTitle>Informasi Pribadi</CardTitle>
          <CardDescription>
            Perbarui nama dan nomor WhatsApp kamu.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="full_name">Nama Lengkap</Label>
            <Input
              id="full_name"
              name="full_name"
              type="text"
              placeholder="Nama lengkap kamu"
              value={form.full_name}
              onChange={handleChange}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="whatsapp">Nomor WhatsApp</Label>
            <Input
              id="whatsapp"
              name="whatsapp"
              type="tel"
              placeholder="08xxxxxxxxxx"
              value={form.whatsapp}
              onChange={handleChange}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Username</Label>
            <Input value={user.username} disabled className="bg-muted" />
          </div>

          <div className="grid gap-1.5">
            <Label>Email</Label>
            <Input value={user.email} disabled className="bg-muted" />
          </div>

          <div className="grid gap-1.5">
            <Label>ID Akun</Label>
            <Input
              value={user.account_id}
              disabled
              className="bg-muted font-mono"
            />
          </div>

          {user.referral_code && (
            <div className="grid gap-1.5">
              <Label>Kode Referral</Label>
              <Input
                value={user.referral_code}
                disabled
                className="bg-muted font-mono"
              />
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button type="submit" disabled={loading}>
            {loading ? "Menyimpan..." : "Simpan Perubahan"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
