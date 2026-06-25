import { useState, useEffect, useMemo, useCallback } from 'react'
import { pcApi } from '@/lib/pc-api'
import { QUICK_ACTIONS } from '@/lib/quick-actions'
import {
  Play,
  Upload,
  Terminal,
  FileUp,
  FileDown,
  FolderOpen,
  Zap,
  Loader2,
  KeyRound,
  SquareTerminal,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { usePcStore } from '@/store/pc-store'
import { cn } from '@/lib/utils'
import { WinRmCredentialsDialog } from './WinRmCredentialsDialog'
import { RemoteFolderBrowser } from './RemoteFolderBrowser'
import { RemoteTerminal } from './RemoteTerminal'
import {
  FileTransferProgress,
  type PcTransferItem,
} from './FileTransferProgress'
import { formatFileSize } from '@/lib/format-bytes'
import type { DeployProgressEvent } from '@/types/pc'

const FETCH_LOCAL_DIR_KEY = 'ofis-yonetim:fetch-local-dir'

type SendTransferState = {
  percent: number
  phase: string
  pcItems: PcTransferItem[]
}

export function CommandPanel() {
  const activeTab = usePcStore(state => state.activeTab)
  const setActiveTab = usePcStore(state => state.setActiveTab)
  const pcs = usePcStore(state => state.pcs)
  const selectedIds = usePcStore(state => state.selectedIds)
  const selected = useMemo(
    () => pcs.filter(pc => selectedIds.has(pc.id)),
    [pcs, selectedIds]
  )
  const setRemoteDirForPc = usePcStore(state => state.setRemoteDirForPc)
  const setResults = usePcStore(state => state.setResults)
  const isRunning = usePcStore(state => state.isRunning)
  const setIsRunning = usePcStore(state => state.setIsRunning)

  const [customCommand, setCustomCommand] = useState('')
  const [localFile, setLocalFile] = useState<File | null>(null)
  const [fileMode, setFileMode] = useState<'send' | 'fetch'>('send')
  const [remoteFilePath, setRemoteFilePath] = useState('')
  const [localSaveDir, setLocalSaveDir] = useState('')
  const [sendTransfer, setSendTransfer] = useState<SendTransferState | null>(
    null
  )
  const [runningActionId, setRunningActionId] = useState<string | null>(null)
  const [credentialsOpen, setCredentialsOpen] = useState(false)
  const [credentialsRequired, setCredentialsRequired] = useState(false)
  const [hasCredentials, setHasCredentials] = useState<boolean | null>(null)

  const terminalPc = selected.length === 1 ? selected[0]! : null
  const browsePc = selected.length === 1 ? selected[0]! : (selected[0] ?? null)
  const browsePcId = browsePc?.id
  const remoteDir = usePcStore(state =>
    browsePcId ? (state.remoteDirsByPcId[browsePcId] ?? '') : ''
  )

  const setRemoteDir = useCallback(
    (dir: string) => {
      if (browsePcId) setRemoteDirForPc(browsePcId, dir)
    },
    [browsePcId, setRemoteDirForPc]
  )

  const handleNeedCredentials = useCallback(() => {
    toast.error('Önce WinRM kimlik bilgilerini ayarlayın')
    setCredentialsOpen(true)
  }, [])

  const refreshCredentialsStatus = async () => {
    const result = await pcApi.loadWinRmCredentials()
    if (result.status === 'ok') {
      const ok = Boolean(result.data.username.trim() && result.data.password)
      setHasCredentials(ok)
      if (!ok) {
        setCredentialsRequired(true)
        setCredentialsOpen(true)
      }
      return
    }
    setHasCredentials(false)
    setCredentialsRequired(true)
    setCredentialsOpen(true)
  }

  const ensureCredentials = () => {
    if (hasCredentials === false) {
      setCredentialsRequired(true)
      setCredentialsOpen(true)
      return false
    }
    const missingHostname = selected.filter(pc => !pc.hostname?.trim())
    if (missingHostname.length > 0) {
      toast.error(
        `Bilgisayar adı eksik: ${missingHostname.map(pc => pc.name).join(', ')} — PC'yi düzenleyin`
      )
      return false
    }
    return true
  }

  useEffect(() => {
    void refreshCredentialsStatus()
  }, [])

  useEffect(() => {
    if (activeTab !== 'file' || fileMode !== 'fetch') return

    const saved = localStorage.getItem(FETCH_LOCAL_DIR_KEY)?.trim()
    if (saved) {
      setLocalSaveDir(saved)
      return
    }

    void (async () => {
      const result = await pcApi.getDownloadsDirectory()
      if (result.status === 'ok') {
        setLocalSaveDir(result.data.path)
      }
    })()
  }, [activeTab, fileMode])

  useEffect(() => {
    if (!browsePc || hasCredentials !== true) return

    const pcId = browsePc.id
    const existing = usePcStore.getState().remoteDirsByPcId[pcId]?.trim()
    if (existing) return

    let cancelled = false
    void (async () => {
      const result = await pcApi.getRemoteDesktopPath(browsePc)
      if (cancelled || result.status === 'error' || !result.data.path) return
      const current =
        usePcStore.getState().remoteDirsByPcId[pcId]?.trim() ?? ''
      if (!current) {
        setRemoteDirForPc(pcId, result.data.path)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [browsePc?.id, hasCredentials, setRemoteDirForPc, browsePc])

  const runCommand = async (command: string, actionLabel?: string) => {
    if (selected.length === 0) {
      toast.error('En az bir PC seçin')
      return
    }
    if (!command.trim()) {
      toast.error('Komut boş olamaz')
      return
    }
    if (!ensureCredentials()) return

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
    if (!localFile) {
      toast.error('Dosya seçin')
      return
    }
    if (!remoteDir.trim()) {
      toast.error('Gezginden hedef klasör seçin')
      return
    }
    if (!ensureCredentials()) return

    const initialPcItems: PcTransferItem[] = selected.map(pc => ({
      id: pc.id,
      name: pc.name,
      status: 'pending',
    }))

    setResults([])
    setSendTransfer({
      percent: 0,
      phase: 'Hazırlanıyor...',
      pcItems: initialPcItems,
    })
    setIsRunning(true)

    const handleDeployProgress = (
      event: DeployProgressEvent,
      percent: number
    ) => {
      setSendTransfer(prev => {
        if (!prev) return prev
        const next: SendTransferState = {
          ...prev,
          percent,
        }

        switch (event.type) {
          case 'upload':
            next.phase =
              event.total > 0
                ? `Dosya yükleniyor... (${formatFileSize(event.loaded)} / ${formatFileSize(event.total)})`
                : 'Dosya yükleniyor...'
            break
          case 'phase':
            next.phase = event.message
            break
          case 'pc-start':
            next.phase = `${event.pc_name} kopyalanıyor (${event.index}/${event.total})`
            next.pcItems = prev.pcItems.map(pc =>
              pc.id === event.pc_id
                ? { ...pc, status: 'running' }
                : pc
            )
            break
          case 'pc-done':
            next.phase =
              event.index < event.total
                ? `Tamamlandı: ${event.result.pc_name} (${event.index}/${event.total})`
                : 'Son kontroller yapılıyor...'
            next.pcItems = prev.pcItems.map(pc =>
              pc.id === event.result.pc_id
                ? {
                    ...pc,
                    status: event.result.success ? 'success' : 'error',
                  }
                : pc
            )
            {
              const current = usePcStore.getState().results
              setResults([
                ...current.filter(r => r.pc_id !== event.result.pc_id),
                event.result,
              ])
            }
            break
          case 'complete':
            next.percent = 100
            next.phase = 'Gönderim tamamlandı'
            break
          default:
            break
        }

        return next
      })
    }

    try {
      const result = await pcApi.deployFileToPcs(
        selected,
        localFile,
        remoteDir.trim(),
        handleDeployProgress
      )
      if (result.status === 'error') {
        setSendTransfer(prev =>
          prev ? { ...prev, phase: 'Gönderim başarısız oldu' } : null
        )
        toast.error(result.error)
        return
      }
      setResults(result.data)
      const ok = result.data.filter(r => r.success).length
      toast.success(`${ok}/${selected.length} PC'ye dosya gönderildi`)
      setSendTransfer(prev =>
        prev
          ? { ...prev, percent: 100, phase: 'Gönderim tamamlandı' }
          : null
      )
    } finally {
      setIsRunning(false)
      window.setTimeout(() => setSendTransfer(null), 2500)
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

  const pickLocalFolder = async () => {
    const result = await pcApi.pickLocalFolder()
    if (result.status === 'error') {
      toast.error(result.error)
      return
    }
    if (result.data) {
      setLocalSaveDir(result.data)
      localStorage.setItem(FETCH_LOCAL_DIR_KEY, result.data)
    }
  }

  const fetchFile = async () => {
    if (selected.length === 0) {
      toast.error('En az bir PC seçin')
      return
    }
    if (!remoteFilePath.trim()) {
      toast.error('Gezginden uzak dosya seçin')
      return
    }
    if (!localSaveDir.trim()) {
      toast.error('Kayıt klasörü seçin')
      return
    }
    if (!ensureCredentials()) return

    setIsRunning(true)
    try {
      const result = await pcApi.fetchFileFromPcs(
        selected,
        remoteFilePath.trim(),
        localSaveDir.trim()
      )
      if (result.status === 'error') {
        toast.error(result.error)
        return
      }
      setResults(result.data)
      const ok = result.data.filter(r => r.success).length
      toast.success(`${ok}/${selected.length} PC'den dosya alındı`)
    } finally {
      setIsRunning(false)
    }
  }

  const noSelection = selected.length === 0

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">Ofis PC Yönetimi</h1>
        <p className="text-sm text-muted-foreground">
          {noSelection
            ? 'Soldan PC seçin, ardından bir işleme tıklayın'
            : `${selected.length} PC seçili — bir işlem seçin`}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
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
          Dosya
        </Button>
        <Button
          variant={activeTab === 'custom' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('custom')}
        >
          <Terminal className="mr-2 size-4" />
          Özel Komut
        </Button>
        <Button
          variant={activeTab === 'terminal' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('terminal')}
        >
          <SquareTerminal className="mr-2 size-4" />
          Uzak Terminal
        </Button>
        </div>
        <Button
          variant={hasCredentials ? 'outline' : 'default'}
          size="sm"
          onClick={() => setCredentialsOpen(true)}
        >
          <KeyRound className="mr-2 size-4" />
          {hasCredentials ? 'Kimlik Bilgileri' : 'Kimlik Bilgileri Ayarla'}
        </Button>
      </div>

      {hasCredentials === false && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          İlk kurulum: <span className="font-mono">ofisadmin</span> ve şifreyi bir
          kez kaydedin. Her yeni PC için sadece bilgisayar adı (örn.{' '}
          <span className="font-mono">DESKTOP-CNT8</span>) girin.
        </p>
      )}

      {activeTab === 'quick' && (
        <ScrollArea className="min-h-0 flex-1">
          <div className="grid auto-rows-min grid-cols-1 gap-3 pr-3 pb-1 sm:grid-cols-2 lg:grid-cols-3">
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
        </ScrollArea>
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
            <CardTitle className="text-base">Dosya İşlemleri</CardTitle>
            <p className="text-sm text-muted-foreground">
              Seçili PC&apos;lere dosya gönderin veya uzak PC&apos;den dosya alın
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                type="button"
                size="sm"
                variant={fileMode === 'send' ? 'default' : 'outline'}
                onClick={() => setFileMode('send')}
              >
                <FileUp className="mr-2 size-4" />
                Gönder
              </Button>
              <Button
                type="button"
                size="sm"
                variant={fileMode === 'fetch' ? 'default' : 'outline'}
                onClick={() => {
                  setFileMode('fetch')
                  setRemoteFilePath('')
                }}
              >
                <FileDown className="mr-2 size-4" />
                Al
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4">
            {fileMode === 'send' ? (
              <>
                <div className="grid gap-2">
                  <Label>Gönderilecek dosya</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={
                        localFile
                          ? `${localFile.name} (${formatFileSize(localFile.size)})`
                          : ''
                      }
                      placeholder="Dosya seçin..."
                    />
                    <Button
                      variant="outline"
                      onClick={pickFile}
                      disabled={Boolean(sendTransfer)}
                    >
                      <Upload className="mr-2 size-4" />
                      Dosya Seç
                    </Button>
                  </div>
                  {localFile && remoteDir.trim() && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {selected.length}
                      </span>{' '}
                      PC&apos;ye{' '}
                      <span className="font-mono">{remoteDir.trim()}</span>{' '}
                      klasörüne gönderilecek.
                    </p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label>Hedef klasör (uzak PC&apos;de)</Label>
                  <Input
                    value={remoteDir}
                    onChange={e => setRemoteDir(e.target.value)}
                    placeholder="Gezginden klasör seçin..."
                    className="font-mono text-sm"
                  />
                  {selected.length > 1 && (
                    <p className="text-xs text-muted-foreground">
                      Klasör gezgini yalnızca {browsePc?.name} için gösterilir.
                      Dosya gönderimi seçili tüm PC&apos;lere aynı klasör yoluna
                      yapılır.
                    </p>
                  )}
                  <RemoteFolderBrowser
                    key={`${browsePc?.id ?? 'none'}-send`}
                    pc={browsePc}
                    value={remoteDir}
                    onChange={setRemoteDir}
                    credentialsReady={hasCredentials === true}
                    onNeedCredentials={handleNeedCredentials}
                    selectionMode="folder"
                  />
                </div>
                {sendTransfer && (
                  <FileTransferProgress
                    percent={sendTransfer.percent}
                    phase={sendTransfer.phase}
                    fileName={localFile?.name}
                    fileSize={localFile?.size}
                    destination={remoteDir.trim()}
                    pcItems={sendTransfer.pcItems}
                  />
                )}
                <Button
                  className="w-fit"
                  onClick={deployFile}
                  disabled={
                    isRunning ||
                    noSelection ||
                    !localFile ||
                    !remoteDir.trim() ||
                    Boolean(sendTransfer)
                  }
                >
                  <FileUp
                    className={cn('mr-2 size-4', isRunning && 'animate-pulse')}
                  />
                  {isRunning ? 'Gönderiliyor...' : 'Dosyayı Gönder'}
                </Button>
              </>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label>Kayıt klasörü (bu PC&apos;de)</Label>
                  <div className="flex gap-2">
                    <Input
                      value={localSaveDir}
                      onChange={e => {
                        const next = e.target.value
                        setLocalSaveDir(next)
                        const trimmed = next.trim()
                        if (trimmed) {
                          localStorage.setItem(FETCH_LOCAL_DIR_KEY, trimmed)
                        }
                      }}
                      placeholder="Dosyanin kaydedilecegi klasor..."
                      className="font-mono text-sm"
                    />
                    <Button type="button" variant="outline" onClick={pickLocalFolder}>
                      <FolderOpen className="mr-2 size-4" />
                      Klasör Seç
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Açık veya kilitli dosyalar (ör. SQLite veritabanı) paylaşımlı
                    okuma veya yedek modu ile kopyalanmaya çalışılır.
                    {selected.length > 1 &&
                      ' Birden fazla PC seçiliyse dosya adına PC adı eklenir.'}
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label>Uzak dosya yolu</Label>
                  <Input
                    value={remoteFilePath}
                    onChange={e => setRemoteFilePath(e.target.value)}
                    placeholder="Gezginden dosya seçin..."
                    className="font-mono text-sm"
                  />
                  {selected.length > 1 && (
                    <p className="text-xs text-muted-foreground">
                      Gezgin yalnızca {browsePc?.name} için gösterilir. Aynı
                      uzak yol seçili tüm PC&apos;lerden alınır.
                    </p>
                  )}
                  <RemoteFolderBrowser
                    key={`${browsePc?.id ?? 'none'}-fetch`}
                    pc={browsePc}
                    value={remoteFilePath}
                    onChange={setRemoteFilePath}
                    credentialsReady={hasCredentials === true}
                    onNeedCredentials={handleNeedCredentials}
                    selectionMode="file"
                  />
                </div>
                <Button
                  className="w-fit"
                  onClick={fetchFile}
                  disabled={
                    isRunning ||
                    noSelection ||
                    !remoteFilePath.trim() ||
                    !localSaveDir.trim()
                  }
                >
                  <FileDown
                    className={cn('mr-2 size-4', isRunning && 'animate-pulse')}
                  />
                  {isRunning ? 'Alınıyor...' : 'Dosyayı Al'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'terminal' && (
        <Card className="flex min-h-0 flex-1 flex-col">
          <CardHeader>
            <CardTitle className="text-base">Uzak Terminal</CardTitle>
            <p className="text-sm text-muted-foreground">
              {terminalPc
                ? `${terminalPc.name} (${terminalPc.address}) — PowerShell oturumu`
                : 'Tek bir PC seçin. Oturum durumu (cd, değişkenler) korunur.'}
            </p>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col">
            <RemoteTerminal
              key={terminalPc?.id ?? 'none'}
              pc={terminalPc}
              credentialsReady={hasCredentials === true}
              className="min-h-0 flex-1"
            />
          </CardContent>
        </Card>
      )}

      <WinRmCredentialsDialog
        open={credentialsOpen}
        onOpenChange={setCredentialsOpen}
        required={credentialsRequired}
        onSaved={() => {
          setCredentialsRequired(false)
          void refreshCredentialsStatus()
        }}
      />
    </div>
  )
}
