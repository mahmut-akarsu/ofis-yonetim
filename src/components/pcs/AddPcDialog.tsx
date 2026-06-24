import { useState } from 'react'
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
import type { ManagedPc } from '@/types/pc'

interface AddPcDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (pc: ManagedPc) => void
  editingPc?: ManagedPc | null
}

export function AddPcDialog({
  open,
  onOpenChange,
  onSave,
  editingPc,
}: AddPcDialogProps) {
  const [name, setName] = useState(editingPc?.name ?? '')
  const [address, setAddress] = useState(editingPc?.address ?? '')
  const [notes, setNotes] = useState(editingPc?.notes ?? '')

  const handleOpen = (isOpen: boolean) => {
    if (isOpen && editingPc) {
      setName(editingPc.name)
      setAddress(editingPc.address)
      setNotes(editingPc.notes ?? '')
    } else if (isOpen) {
      setName('')
      setAddress('')
      setNotes('')
    }
    onOpenChange(isOpen)
  }

  const handleSubmit = () => {
    if (!name.trim() || !address.trim()) return

    onSave({
      id: editingPc?.id ?? crypto.randomUUID(),
      name: name.trim(),
      address: address.trim(),
      notes: notes.trim() || null,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingPc ? 'PC Düzenle' : 'PC Ekle'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="pc-name">Ad</Label>
            <Input
              id="pc-name"
              placeholder="Muhasebe-1"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pc-address">Tailscale IP / Hostname</Label>
            <Input
              id="pc-address"
              placeholder="100.x.x.x"
              value={address}
              onChange={e => setAddress(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pc-notes">Not (opsiyonel)</Label>
            <Input
              id="pc-notes"
              placeholder="Kat 2, sol taraf"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || !address.trim()}>
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
