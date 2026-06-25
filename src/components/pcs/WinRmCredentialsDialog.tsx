import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { pcApi } from '@/lib/pc-api'

interface WinRmCredentialsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
  required?: boolean
}

export function WinRmCredentialsDialog({
  open,
  onOpenChange,
  onSaved,
  required = false,
}: WinRmCredentialsDialogProps) {
  const [username, setUsername] = useState('ofisadmin')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return

    setLoading(true)
    pcApi
      .loadWinRmCredentials()
      .then(result => {
        if (result.status === 'ok') {
          if (result.data.username) setUsername(result.data.username)
          if (result.data.password) setPassword(result.data.password)
        }
      })
      .finally(() => setLoading(false))
  }, [open])

  const handleSave = async () => {
    if (!username.trim() || !password) {
      toast.error('Kullanıcı adı ve şifre gerekli')
      return
    }

    setSaving(true)
    try {
      const result = await pcApi.saveWinRmCredentials({
        username: username.trim(),
        password,
      })
      if (result.status === 'error') {
        toast.error(result.error)
        return
      }
      toast.success('Kimlik bilgileri kaydedildi — bir daha girmeniz gerekmez')
      onSaved?.()
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (required && !next) return
        onOpenChange(next)
      }}
    >
      <DialogContent
        onInteractOutside={required ? e => e.preventDefault() : undefined}
        onEscapeKeyDown={required ? e => e.preventDefault() : undefined}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5" />
            WinRM Kimlik Bilgileri
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <p className="text-sm text-muted-foreground">
            Tüm PC&apos;ler için <strong>bir kez</strong> girin. Her PC eklerken
            sadece bilgisayar adını (örn. <span className="font-mono">DESKTOP-CNT7</span>)
            yazmanız yeterli.
          </p>
          <div className="grid gap-2">
            <Label htmlFor="winrm-username">Kullanıcı adı</Label>
            <Input
              id="winrm-username"
              placeholder="ofisadmin"
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="winrm-password">Şifre</Label>
            <Input
              id="winrm-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>
        <DialogFooter>
          {!required && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              İptal
            </Button>
          )}
          <Button onClick={handleSave} disabled={loading || saving}>
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
