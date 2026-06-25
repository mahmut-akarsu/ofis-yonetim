import { useState } from 'react'
import { Monitor, Plus, RefreshCw, Trash2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { usePcStore } from '@/store/pc-store'
import { useManagedPcs } from '@/hooks/use-managed-pcs'
import { pcApi } from '@/lib/pc-api'
import { AddPcDialog } from './AddPcDialog'
import type { ManagedPc } from '@/types/pc'

export function PcSidebar() {
  const pcs = usePcStore(state => state.pcs)
  const selectedIds = usePcStore(state => state.selectedIds)
  const connectionStatus = usePcStore(state => state.connectionStatus)
  const toggleSelection = usePcStore(state => state.toggleSelection)
  const selectOnly = usePcStore(state => state.selectOnly)
  const selectAll = usePcStore(state => state.selectAll)
  const clearSelection = usePcStore(state => state.clearSelection)
  const addPc = usePcStore(state => state.addPc)
  const removePc = usePcStore(state => state.removePc)
  const updatePc = usePcStore(state => state.updatePc)
  const setConnectionStatus = usePcStore(state => state.setConnectionStatus)

  const { savePcs } = useManagedPcs()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPc, setEditingPc] = useState<ManagedPc | null>(null)
  const [checking, setChecking] = useState(false)

  const persistPcs = async (nextPcs: ManagedPc[]) => {
    const result = await savePcs(nextPcs)
    if (result.trustedHosts && !result.trustedHosts.success) {
      toast.warning(
        `TrustedHosts güncellenemedi: ${result.trustedHosts.error}. Uygulamayı yönetici olarak başlatın.`
      )
    } else if (result.trustedHosts?.added?.length) {
      toast.success(
        `TrustedHosts güncellendi: ${result.trustedHosts.added.join(', ')}`
      )
    }
    return result
  }

  const handleSavePc = async (pc: ManagedPc) => {
    const currentPcs = usePcStore.getState().pcs
    const exists = currentPcs.some(p => p.id === pc.id)
    const nextPcs = exists
      ? currentPcs.map(p => (p.id === pc.id ? pc : p))
      : [...currentPcs, pc]

    if (exists) {
      updatePc(pc)
    } else {
      addPc(pc)
    }
    await persistPcs(nextPcs)
    toast.success(exists ? 'PC güncellendi' : 'PC eklendi')
  }

  const handleRemove = async (id: string) => {
    const next = pcs.filter(p => p.id !== id)
    removePc(id)
    await persistPcs(next)
    toast.success('PC silindi')
  }

  const handleCheckConnections = async () => {
    if (pcs.length === 0) return
    setChecking(true)
    try {
      const result = await pcApi.checkPcConnections(pcs)
      if (result.status === 'error') {
        toast.error(result.error)
        return
      }
      setConnectionStatus(result.data)
      const online = result.data.filter(s => s.online).length
      toast.success(`${online}/${pcs.length} PC erişilebilir`)
    } finally {
      setChecking(false)
    }
  }

  const allSelected = pcs.length > 0 && selectedIds.size === pcs.length

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-3">
        <div>
          <h2 className="text-sm font-semibold">Bilgisayarlar</h2>
          <p className="text-xs text-muted-foreground">{pcs.length} PC kayıtlı</p>
        </div>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            title="Bağlantıları kontrol et"
            onClick={handleCheckConnections}
            disabled={checking || pcs.length === 0}
          >
            <RefreshCw className={cn('size-4', checking && 'animate-spin')} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title="PC ekle"
            onClick={() => {
              setEditingPc(null)
              setDialogOpen(true)
            }}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Checkbox
          checked={allSelected}
          onCheckedChange={checked => (checked ? selectAll() : clearSelection())}
        />
        <span className="text-xs text-muted-foreground">
          {selectedIds.size} seçili
        </span>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {pcs.length === 0 && (
            <div className="px-2 py-8 text-center text-sm text-muted-foreground">
              Henüz PC eklenmedi.
              <br />
              Tailscale IP ile ekleyin.
            </div>
          )}
          {pcs.map(pc => {
            const status = connectionStatus[pc.id]
            return (
              <div
                key={pc.id}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/60',
                  selectedIds.has(pc.id) && 'bg-muted'
                )}
              >
                <Checkbox
                  checked={selectedIds.has(pc.id)}
                  onCheckedChange={() => toggleSelection(pc.id)}
                />
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => selectOnly(pc.id)}
                >
                  <Monitor className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{pc.name}</span>
                      {status && (
                        <Badge
                          variant={status.online ? 'default' : 'secondary'}
                          className="h-5 px-1.5 text-[10px]"
                        >
                          {status.online ? 'Online' : 'Offline'}
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{pc.address}</p>
                  </div>
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  onClick={() => {
                    setEditingPc(pc)
                    setDialogOpen(true)
                  }}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-destructive"
                  onClick={() => handleRemove(pc.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            )
          })}
        </div>
      </ScrollArea>

      <AddPcDialog
        open={dialogOpen}
        onOpenChange={open => {
          setDialogOpen(open)
          if (!open) setEditingPc(null)
        }}
        onSave={handleSavePc}
        editingPc={editingPc}
      />
    </div>
  )
}
