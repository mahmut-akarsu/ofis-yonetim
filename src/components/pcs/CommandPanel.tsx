import { useState } from 'react'
import { pcApi } from '@/lib/pc-api'
import { QUICK_ACTIONS } from '@/lib/quick-actions'
import {
  Play,
  Upload,
  Terminal,
  FileUp,
  Zap,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePcStore } from '@/store/pc-store'
import { cn } from '@/lib/utils'

export function CommandPanel() {
  const activeTab = usePcStore(state => state.activeTab)
  const setActiveTab = usePcStore(state => state.setActiveTab)
  const getSelectedPcs = usePcStore(state => state.getSelectedPcs)
  const setResults = usePcStore(state => state.setResults)
  const isRunning = usePcStore(state => state.isRunning)
  const setIsRunning = usePcStore(state => state.setIsRunning)

  const [customCommand, setCustomCommand] = useState('')
  const [localFile, setLocalFile] = useState('')
  const [remoteDir, setRemoteDir] = useState('C:\\Temp')
  const [runningActionId, setRunningActionId] = useState<string | null>(null)

  const selected = getSelectedPcs()

  const runCommand = async (command: string, actionLabel?: string) => {
    if (selected.length === 0) {
      toast.error('En az bir PC seçin')
      return
    }
    if (!command.trim()) {
      toast.error('Komut boş olamaz')
      return
    }

    setIsRunning(true)
    try {
      const result = await pcApi.runRemoteCommand(selected, command.trim())
      if (result.status === 'error') {
        toast.error(result.error)
        return
      }
      setResults(result.data)
      const ok = result.data.filter(r => r.success).length
      toast.success(
        actionLabel
          ? `${actionLabel}: ${ok}/${selected.length} PC tamamlandı`
          : `${ok}/${selected.length} PC'de tamamlandı`
      )
    } finally {
      setIsRunning(false)
      setRunningActionId(null)
    }
  }

  const runQuickAction = async (actionId: string, command: string, title: string) => {
    setRunningActionId(actionId)
    await runCommand(command, title)
  }

  const deployFile = async () => {
    if (selected.length === 0) {
      toast.error('En az bir PC seçin')
      return
    }
    if (!localFile.trim()) {
      toast.error('Dosya seçin')
      return
    }

    setIsRunning(true)
    try {
      const result = await pcApi.deployFileToPcs(
        selected,
        localFile.trim(),
        remoteDir.trim() || 'C:\\Temp'
      )
      if (result.status === 'error') {
        toast.error(result.error)
        return
      }
      setResults(result.data)
      const ok = result.data.filter(r => r.success).length
      toast.success(`${ok}/${selected.length} PC'ye dosya gönderildi`)
    } finally {
      setIsRunning(false)
    }
  }

  const pickFile = async () => {
    const result = await pcApi.pickFile()
    if (result.status === 'error') {
      toast.error(result.error)
      return
    }
    if (result.data) {
      setLocalFile(result.data)
    }
  }

  const noSelection = selected.length === 0

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">Ofis PC Yönetimi</h1>
        <p className="text-sm text-muted-foreground">
          {noSelection
            ? 'Soldan PC seçin, ardından bir işleme tıklayın'
            : `${selected.length} PC seçili — bir işlem seçin`}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={activeTab === 'quick' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('quick')}
        >
          <Zap className="mr-2 size-4" />
          Hızlı İşlemler
        </Button>
        <Button
          variant={activeTab === 'file' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('file')}
        >
          <FileUp className="mr-2 size-4" />
          Dosya Gönder
        </Button>
        <Button
          variant={activeTab === 'custom' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('custom')}
        >
          <Terminal className="mr-2 size-4" />
          Özel Komut
        </Button>
      </div>

      {activeTab === 'quick' && (
        <div className="grid flex-1 auto-rows-min grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_ACTIONS.map(action => {
            const Icon = action.icon
            const isThisRunning = runningActionId === action.id

            return (
              <button
                key={action.id}
                type="button"
                disabled={isRunning || noSelection}
                onClick={() =>
                  runQuickAction(action.id, action.command, action.title)
                }
                className={cn(
                  'group flex flex-col items-start gap-3 rounded-xl border bg-card p-4 text-left transition-all',
                  'hover:border-primary/50 hover:bg-accent/50 hover:shadow-sm',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  isThisRunning && 'border-primary ring-2 ring-primary/20'
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {isThisRunning ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : (
                      <Icon className="size-5" />
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                    {isThisRunning ? 'Çalışıyor...' : 'Çalıştır →'}
                  </span>
                </div>
                <div>
                  <p className="font-semibold">{action.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {action.description}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {activeTab === 'custom' && (
        <Card className="flex flex-1 flex-col">
          <CardHeader>
            <CardTitle className="text-base">Özel Komut</CardTitle>
            <p className="text-sm text-muted-foreground">
              İleri düzey kullanım için PowerShell komutu yazın. Günlük işlemler
              için Hızlı İşlemler sekmesini kullanın.
            </p>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4">
            <Textarea
              className="min-h-[200px] flex-1 font-mono text-sm"
              value={customCommand}
              onChange={e => setCustomCommand(e.target.value)}
              placeholder="Örn: Get-Service | Where-Object Status -eq 'Running'"
            />
            <Button
              className="w-fit"
              onClick={() => runCommand(customCommand)}
              disabled={isRunning || noSelection || !customCommand.trim()}
            >
              <Play className={cn('mr-2 size-4', isRunning && 'animate-pulse')} />
              {isRunning ? 'Çalışıyor...' : 'Komutu Çalıştır'}
            </Button>
          </CardContent>
        </Card>
      )}

      {activeTab === 'file' && (
        <Card className="flex flex-1 flex-col">
          <CardHeader>
            <CardTitle className="text-base">Dosya Dağıtımı</CardTitle>
            <p className="text-sm text-muted-foreground">
              Seçili PC'lere dosya gönderin
            </p>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4">
            <div className="grid gap-2">
              <Label>Gönderilecek dosya</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={localFile ? localFile.split('\\').pop() : ''}
                  placeholder="Dosya seçin..."
                />
                <Button variant="outline" onClick={pickFile}>
                  <Upload className="mr-2 size-4" />
                  Dosya Seç
                </Button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Hedef klasör (uzak PC'de)</Label>
              <Input
                value={remoteDir}
                onChange={e => setRemoteDir(e.target.value)}
                placeholder="C:\Temp"
              />
            </div>
            <Button
              className="w-fit"
              onClick={deployFile}
              disabled={isRunning || noSelection || !localFile.trim()}
            >
              <FileUp className={cn('mr-2 size-4', isRunning && 'animate-pulse')} />
              {isRunning ? 'Gönderiliyor...' : 'Dosyayı Gönder'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
