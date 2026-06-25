import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronRight,
  Folder,
  HardDrive,
  ArrowUp,
  Check,
  RefreshCw,
  Loader2,
  File,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { pcApi } from '@/lib/pc-api'
import { cn } from '@/lib/utils'
import type { ManagedPc, RemoteBrowseEntry, RemoteBrowseResult } from '@/types/pc'

interface RemoteFolderBrowserProps {
  pc: ManagedPc | null
  value: string
  onChange: (path: string) => void
  credentialsReady: boolean
  onNeedCredentials: () => void
  selectionMode?: 'folder' | 'file'
}

function splitBreadcrumb(path: string) {
  if (!path) return []

  const parts = path.replace(/\\+$/, '').split('\\')
  const crumbs: { label: string; path: string }[] = []

  if (parts[0]?.endsWith(':')) {
    let current = parts[0] + '\\'
    crumbs.push({ label: parts[0], path: current })
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i]
      if (!part) continue
      current = current.replace(/\\+$/, '') + '\\' + part
      crumbs.push({ label: part, path: current })
    }
  }

  return crumbs
}

function isMissingFolderError(message: string) {
  const lower = message.toLowerCase()
  return lower.includes('klasor bulunamadi') || lower.includes('klasör bulunamadı')
}

function cacheKey(pcId: string, path: string, includeFiles: boolean) {
  return `${pcId}::${path}${includeFiles ? '::files' : ''}`
}

function formatFileSize(bytes?: number) {
  if (bytes === undefined || bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function RemoteFolderBrowser({
  pc,
  value,
  onChange,
  credentialsReady,
  onNeedCredentials,
  selectionMode = 'folder',
}: RemoteFolderBrowserProps) {
  const [browsePath, setBrowsePath] = useState('')
  const [entries, setEntries] = useState<RemoteBrowseEntry[]>([])
  const [quickFolders, setQuickFolders] = useState<
    { label: string; path: string }[]
  >([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [parent, setParent] = useState<string | null>(null)

  const browseCacheRef = useRef<Map<string, RemoteBrowseResult>>(new Map())
  const initPcRef = useRef<string | null>(null)
  const selectedPathRef = useRef(value)
  const loadedValueRef = useRef('')

  useEffect(() => {
    selectedPathRef.current = value
  }, [value])

  const applyBrowseResult = useCallback((data: RemoteBrowseResult) => {
    setBrowsePath(data.path)
    setParent(data.parent)
    setEntries(data.entries)
    setQuickFolders(data.quick_folders)
    setError(null)
  }, [])

  const includeFiles = selectionMode === 'file'

  const loadDirectory = useCallback(
    async (
      path: string,
      options?: { allowFallback?: boolean; force?: boolean }
    ) => {
      if (!pc) return
      if (!credentialsReady) {
        onNeedCredentials()
        return
      }

      const allowFallback = options?.allowFallback ?? true
      const force = options?.force ?? false
      const key = cacheKey(pc.id, path, includeFiles)

      if (!force) {
        const cached = browseCacheRef.current.get(key)
        if (cached) {
          applyBrowseResult(cached)
          return
        }
      }

      setLoading(true)
      setError(null)

      try {
        const result = await pcApi.browseRemoteDirectory(pc, path, {
          includeFiles,
        })
        if (result.status === 'error') {
          if (allowFallback && path && isMissingFolderError(result.error)) {
            toast.warning(`"${path}" uzak PC'de yok. Sürücüler gösteriliyor.`)
            await loadDirectory('', { allowFallback: false, force })
            return
          }
          setError(result.error)
          return
        }

        browseCacheRef.current.set(key, result.data)
        applyBrowseResult(result.data)
      } finally {
        setLoading(false)
      }
    },
    [pc, credentialsReady, onNeedCredentials, applyBrowseResult, includeFiles]
  )

  const loadDirectoryRef = useRef(loadDirectory)
  loadDirectoryRef.current = loadDirectory

  useEffect(() => {
    if (!pc || !credentialsReady) return

    const pcChanged = initPcRef.current !== pc.id
    if (pcChanged) {
      initPcRef.current = pc.id
      browseCacheRef.current.clear()
      loadedValueRef.current = ''
    }

    const path = value.trim()

    if (pcChanged) {
      loadedValueRef.current = path
      void loadDirectoryRef.current(path || '', { allowFallback: true })
      return
    }

    if (path && path !== loadedValueRef.current) {
      loadedValueRef.current = path
      void loadDirectoryRef.current(path, { allowFallback: true })
    }
  }, [pc?.id, credentialsReady, value, includeFiles])

  const navigateTo = (path: string) => {
    void loadDirectory(path)
  }

  const selectCurrentFolder = () => {
    const selected = browsePath
    if (!selected) {
      toast.error('Önce bir klasöre girin ve "Bu klasörü seç"e tıklayın')
      return
    }
    selectedPathRef.current = selected
    loadedValueRef.current = selected
    onChange(selected)
    toast.success('Hedef klasör seçildi')
  }

  const selectFile = (entry: RemoteBrowseEntry) => {
    selectedPathRef.current = entry.path
    loadedValueRef.current = entry.path
    onChange(entry.path)
    toast.success('Dosya seçildi')
  }

  const breadcrumbs = splitBreadcrumb(browsePath)

  if (!pc) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
        Klasörleri görmek için en az bir PC seçin.
      </p>
    )
  }

  return (
    <div className="rounded-lg border bg-muted/20">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            Uzak PC: {pc.name}
          </p>
          <p className="truncate font-mono text-sm">
            {browsePath || 'Sürücüler'}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            title="Yenile"
            disabled={loading}
            onClick={() => void loadDirectory(browsePath, { force: true })}
          >
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => navigateTo('')}
          >
            <HardDrive className="mr-1 size-4" />
            Sürücüler
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={parent === null || loading}
            onClick={() => parent !== null && navigateTo(parent)}
          >
            <ArrowUp className="mr-1 size-4" />
            Üst
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!browsePath || loading || selectionMode === 'file'}
            onClick={selectCurrentFolder}
          >
            <Check className="mr-1 size-4" />
            Bu klasörü seç
          </Button>
        </div>
      </div>

      {quickFolders.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b px-3 py-2">
          {quickFolders.map(folder => (
            <Button
              key={folder.path}
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={loading}
              onClick={() => navigateTo(folder.path)}
            >
              {folder.label}
            </Button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1 border-b px-3 py-2 text-xs">
        <button
          type="button"
          className={cn(
            'hover:text-foreground',
            !browsePath ? 'font-medium text-foreground' : 'text-muted-foreground'
          )}
          onClick={() => navigateTo('')}
        >
          Sürücüler
        </button>
        {breadcrumbs.map(crumb => (
          <span key={crumb.path} className="flex items-center gap-1">
            <ChevronRight className="size-3 text-muted-foreground" />
            <button
              type="button"
              className="hover:text-foreground"
              onClick={() => navigateTo(crumb.path)}
            >
              {crumb.label}
            </button>
          </span>
        ))}
      </div>

      <ScrollArea className="h-56">
        <div className="p-2">
          {loading && entries.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Klasörler yükleniyor...
            </div>
          )}

          {!loading && error && (
            <div className="space-y-3 px-2 py-6 text-center">
              <p
                data-selectable="true"
                className="select-text text-sm text-destructive"
              >
                {error}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => navigateTo('')}
              >
                <HardDrive className="mr-1 size-4" />
                Sürücüleri göster
              </Button>
            </div>
          )}

          {!error && entries.length === 0 && !loading && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {includeFiles
                ? 'Bu konumda klasör veya dosya yok.'
                : 'Bu konumda alt klasör yok.'}
            </p>
          )}

          {entries.map(entry => {
            const isFile = entry.type === 'file'
            const isSelected = includeFiles && isFile && value === entry.path

            return (
              <button
                key={entry.path}
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted',
                  isSelected && 'bg-primary/10 ring-1 ring-primary/30'
                )}
                onClick={() =>
                  isFile ? selectFile(entry) : navigateTo(entry.path)
                }
              >
                {entry.type === 'drive' ? (
                  <HardDrive className="size-4 shrink-0 text-primary" />
                ) : isFile ? (
                  <File className="size-4 shrink-0 text-sky-500" />
                ) : (
                  <Folder className="size-4 shrink-0 text-amber-500" />
                )}
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                {isFile && entry.size_bytes !== undefined && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatFileSize(entry.size_bytes)}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </ScrollArea>

      {value ? (
        <div
          data-selectable="true"
          className="select-text border-t px-3 py-2 text-xs text-muted-foreground"
        >
          {includeFiles ? 'Seçili dosya' : 'Seçili hedef'}:{' '}
          <span className="font-mono text-foreground">{value}</span>
        </div>
      ) : (
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          {includeFiles
            ? 'Klasörlere girin ve almak istediğiniz dosyaya tıklayın.'
            : 'Varsayılan: uzak PC masaüstü. Farklı klasör için gezginde seçin.'}
        </div>
      )}
    </div>
  )
}
