import { CheckCircle2, Loader2, Circle, XCircle } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { formatFileSize } from '@/lib/format-bytes'
import { cn } from '@/lib/utils'

export type PcTransferStatus = 'pending' | 'running' | 'success' | 'error'

export interface PcTransferItem {
  id: string
  name: string
  status: PcTransferStatus
}

interface FileTransferProgressProps {
  percent: number
  phase: string
  fileName?: string
  fileSize?: number
  destination?: string
  pcItems?: PcTransferItem[]
  className?: string
}

function statusIcon(status: PcTransferStatus) {
  switch (status) {
    case 'running':
      return <Loader2 className="size-3.5 animate-spin text-primary" />
    case 'success':
      return <CheckCircle2 className="size-3.5 text-emerald-600" />
    case 'error':
      return <XCircle className="size-3.5 text-destructive" />
    default:
      return <Circle className="size-3.5 text-muted-foreground/50" />
  }
}

export function FileTransferProgress({
  percent,
  phase,
  fileName,
  fileSize,
  destination,
  pcItems,
  className,
}: FileTransferProgressProps) {
  return (
    <div
      className={cn(
        'space-y-3 rounded-lg border bg-muted/30 p-4',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">{phase}</p>
          {fileName && (
            <p className="truncate text-xs text-muted-foreground">
              {fileName}
              {fileSize ? ` · ${formatFileSize(fileSize)}` : ''}
            </p>
          )}
          {destination && (
            <p className="truncate font-mono text-xs text-muted-foreground">
              → {destination}
            </p>
          )}
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">
          {Math.round(percent)}%
        </span>
      </div>

      <Progress value={percent} />

      {pcItems && pcItems.length > 0 && (
        <ul className="space-y-1.5 border-t pt-3">
          {pcItems.map(pc => (
            <li
              key={pc.id}
              className={cn(
                'flex items-center gap-2 text-xs',
                pc.status === 'running' && 'font-medium text-foreground',
                pc.status === 'pending' && 'text-muted-foreground'
              )}
            >
              {statusIcon(pc.status)}
              <span className="truncate">{pc.name}</span>
              {pc.status === 'running' && (
                <span className="text-muted-foreground">kopyalanıyor...</span>
              )}
              {pc.status === 'success' && (
                <span className="text-emerald-600">tamam</span>
              )}
              {pc.status === 'error' && (
                <span className="text-destructive">hata</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
