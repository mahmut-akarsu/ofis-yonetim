import { CheckCircle2, XCircle } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { usePcStore } from '@/store/pc-store'
import { cn } from '@/lib/utils'

export function ResultsPanel() {
  const results = usePcStore(state => state.results)
  const isRunning = usePcStore(state => state.isRunning)

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-3 py-3">
        <h2 className="text-sm font-semibold">Sonuçlar</h2>
        <p className="text-xs text-muted-foreground">
          {isRunning ? 'İşlem devam ediyor...' : `${results.length} kayıt`}
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-3 p-3">
          {results.length === 0 && !isRunning && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Henüz sonuç yok. Komut çalıştırın veya dosya gönderin.
            </p>
          )}

          {results.map((result, index) => (
            <div
              key={`${result.pc_id}-${index}`}
              className="rounded-lg border bg-card p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{result.pc_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {result.address}
                  </p>
                </div>
                <Badge
                  variant={result.success ? 'default' : 'destructive'}
                  className="shrink-0 gap-1"
                >
                  {result.success ? (
                    <CheckCircle2 className="size-3" />
                  ) : (
                    <XCircle className="size-3" />
                  )}
                  {result.success ? 'Başarılı' : 'Hata'}
                </Badge>
              </div>
              <pre
                className={cn(
                  'max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 font-mono text-xs',
                  !result.success && 'text-destructive'
                )}
              >
                {result.output || '(çıktı yok)'}
              </pre>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
