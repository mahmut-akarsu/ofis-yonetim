import type {
  DeployProgressEvent,
  ManagedPc,
  PcApiResult,
  PcConnectionStatus,
  RemoteBrowseResult,
  RemoteOperationResult,
  SavePcsResult,
  WinRmCredentials,
} from '@/types/pc'

const API_BASE = 'http://127.0.0.1:9876/api'

function parseApiError(text: string): string {
  if (text.includes('Cannot POST') || text.includes('Cannot GET')) {
    return 'API güncel değil. Terminalde Ctrl+C ile durdurup `npm run start` ile yeniden başlatın.'
  }

  try {
    const json = JSON.parse(text) as {
      error?: string
      debug?: { rawOutput?: string; hint?: string }
    }
    if (json.error) {
      const parts = [json.error]
      if (json.debug?.rawOutput) {
        parts.push(`\n\nHam çıktı:\n${json.debug.rawOutput}`)
      }
      if (json.debug?.hint) {
        parts.push(`\n\n${json.debug.hint}`)
      }
      return parts.join('')
    }
  } catch {
    // not JSON
  }

  if (text.includes('<!DOCTYPE') || text.includes('<html')) {
    const match = text.match(/<pre>([^<]+)<\/pre>/i)
    if (match?.[1]) return match[1].trim()
    return 'Sunucu hatası. Uygulamayı yeniden başlatmayı deneyin.'
  }

  return text
}

function parseNdjsonStream(
  text: string,
  fromLine: number,
  onEvent: (event: DeployProgressEvent) => void
): number {
  const lines = text.split('\n')
  let nextLine = fromLine

  for (let i = fromLine; i < lines.length - 1; i++) {
    const line = lines[i]?.trim()
    if (!line) {
      nextLine = i + 1
      continue
    }
    try {
      onEvent(JSON.parse(line) as DeployProgressEvent)
      nextLine = i + 1
    } catch {
      break
    }
  }

  return nextLine
}

function deployPercentFromEvent(
  event: DeployProgressEvent,
  currentPercent: number
): number {
  switch (event.type) {
    case 'upload':
      if (!event.total) return currentPercent
      return Math.min(35, (event.loaded / event.total) * 35)
    case 'phase':
      return Math.max(currentPercent, 35)
    case 'pc-start':
      if (event.total <= 0) return currentPercent
      return 35 + ((event.index - 1) / event.total) * 65
    case 'pc-done':
      if (event.total <= 0) return currentPercent
      return 35 + (event.index / event.total) * 65
    case 'complete':
      return 100
    default:
      return currentPercent
  }
}

async function deployRequestWithProgress(
  formData: FormData,
  onProgress?: (event: DeployProgressEvent, percent: number) => void
): Promise<PcApiResult<RemoteOperationResult[]>> {
  return new Promise(resolve => {
    const xhr = new XMLHttpRequest()
    let processedLines = 0
    let percent = 0
    let finalResults: RemoteOperationResult[] | null = null
    let streamError: string | null = null

    const handleEvent = (event: DeployProgressEvent) => {
      percent = deployPercentFromEvent(event, percent)
      onProgress?.(event, percent)

      if (event.type === 'complete') {
        finalResults = event.results
      }
      if (event.type === 'error') {
        streamError = event.error
      }
    }

    const processResponse = (includePartialLastLine: boolean) => {
      const text = xhr.responseText ?? ''
      processedLines = parseNdjsonStream(text, processedLines, handleEvent)

      if (includePartialLastLine) {
        const lines = text.split('\n')
        const last = lines.at(-1)?.trim()
        if (last) {
          try {
            handleEvent(JSON.parse(last) as DeployProgressEvent)
            processedLines = lines.length
          } catch {
            // incomplete json
          }
        }
      }
    }

    xhr.upload.onprogress = event => {
      if (!event.lengthComputable) return
      handleEvent({
        type: 'upload',
        loaded: event.loaded,
        total: event.total,
      })
    }

    xhr.onprogress = () => {
      processResponse(false)
    }

    xhr.onerror = () => {
      resolve({
        status: 'error',
        error:
          "Yerel API'ye baglanilamadi. `npm run start` ile sunucuyu baslatin.",
      })
    }

    xhr.onload = () => {
      processResponse(true)

      if (xhr.status >= 200 && xhr.status < 300) {
        if (streamError) {
          resolve({ status: 'error', error: streamError })
          return
        }
        if (finalResults) {
          resolve({ status: 'ok', data: finalResults })
          return
        }

        try {
          const data = JSON.parse(xhr.responseText) as RemoteOperationResult[]
          resolve({ status: 'ok', data })
        } catch {
          resolve({
            status: 'error',
            error: parseApiError(xhr.responseText) || 'Beklenmeyen sunucu yanıtı',
          })
        }
        return
      }

      resolve({
        status: 'error',
        error: parseApiError(xhr.responseText) || xhr.statusText,
      })
    }

    xhr.open('POST', `${API_BASE}/deploy?stream=1`)
    xhr.setRequestHeader('X-Stream-Progress', '1')
    xhr.send(formData)
  })
}

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<PcApiResult<T>> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })

    if (!response.ok) {
      const text = await response.text()
      return { status: 'error', error: parseApiError(text) || response.statusText }
    }

    const data = (await response.json()) as T
    return { status: 'ok', data }
  } catch (error) {
    return {
      status: 'error',
      error:
        "Yerel API'ye baglanilamadi. `npm run start` ile sunucuyu baslatin.",
    }
  }
}

export const pcApi = {
  loadManagedPcs(): Promise<PcApiResult<ManagedPc[]>> {
    return request<ManagedPc[]>('/pcs')
  },

  saveManagedPcs(pcs: ManagedPc[]): Promise<PcApiResult<SavePcsResult>> {
    return request<SavePcsResult>('/pcs', {
      method: 'POST',
      body: JSON.stringify(pcs),
    })
  },

  checkPcConnections(
    pcs: ManagedPc[]
  ): Promise<PcApiResult<PcConnectionStatus[]>> {
    return request<PcConnectionStatus[]>('/pcs/check', {
      method: 'POST',
      body: JSON.stringify(pcs),
    })
  },

  runRemoteCommand(
    pcs: ManagedPc[],
    command: string
  ): Promise<PcApiResult<RemoteOperationResult[]>> {
    return request<RemoteOperationResult[]>('/command', {
      method: 'POST',
      body: JSON.stringify({ pcs, command }),
    })
  },

  deployFileToPcs(
    pcs: ManagedPc[],
    file: File,
    remoteDir: string,
    onProgress?: (event: DeployProgressEvent, percent: number) => void
  ): Promise<PcApiResult<RemoteOperationResult[]>> {
    const formData = new FormData()
    formData.append('file', file, file.name)
    formData.append('pcs', JSON.stringify(pcs))
    formData.append('remoteDir', remoteDir)

    return deployRequestWithProgress(formData, onProgress)
  },

  loadWinRmCredentials(): Promise<PcApiResult<WinRmCredentials>> {
    return request<WinRmCredentials>('/credentials')
  },

  saveWinRmCredentials(
    credentials: WinRmCredentials
  ): Promise<PcApiResult<{ ok: boolean }>> {
    return request<{ ok: boolean }>('/credentials', {
      method: 'POST',
      body: JSON.stringify(credentials),
    })
  },

  browseRemoteDirectory(
    pc: ManagedPc,
    path?: string,
    options?: { includeFiles?: boolean }
  ): Promise<PcApiResult<RemoteBrowseResult>> {
    return request<RemoteBrowseResult>('/browse', {
      method: 'POST',
      body: JSON.stringify({
        pc,
        path: path ?? '',
        includeFiles: Boolean(options?.includeFiles),
      }),
    })
  },

  fetchFileFromPcs(
    pcs: ManagedPc[],
    remotePath: string,
    localDir?: string
  ): Promise<PcApiResult<RemoteOperationResult[]>> {
    return request<RemoteOperationResult[]>('/fetch', {
      method: 'POST',
      body: JSON.stringify({ pcs, remotePath, localDir: localDir?.trim() || '' }),
    })
  },

  pickLocalFolder(): Promise<PcApiResult<string | null>> {
    if (typeof window !== 'undefined' && window.ofisApi?.pickFolder) {
      return window.ofisApi
        .pickFolder()
        .then(path => ({ status: 'ok' as const, data: path }))
        .catch(error => ({ status: 'error' as const, error: String(error) }))
    }

    return request<{ path: string } | { cancelled: true }>('/pick-folder', {
      method: 'POST',
      body: JSON.stringify({}),
    }).then(result => {
      if (result.status === 'error') return result
      if ('cancelled' in result.data) {
        return { status: 'ok' as const, data: null }
      }
      return { status: 'ok' as const, data: result.data.path }
    })
  },

  getDownloadsDirectory(): Promise<PcApiResult<{ path: string }>> {
    return request<{ path: string }>('/downloads-dir')
  },

  getRemoteDesktopPath(
    pc: ManagedPc
  ): Promise<PcApiResult<{ path: string }>> {
    return request<{ path: string }>('/desktop-path', {
      method: 'POST',
      body: JSON.stringify({ pc }),
    })
  },

  async pickFile(): Promise<PcApiResult<File | null>> {
    try {
      const input = document.createElement('input')
      input.type = 'file'

      const file = await new Promise<File | null>(resolve => {
        input.onchange = () => resolve(input.files?.[0] ?? null)
        input.click()
      })

      return { status: 'ok', data: file }
    } catch (error) {
      return { status: 'error', error: String(error) }
    }
  },
}

export function isTauri() {
  return typeof window !== 'undefined' && '__TAURI__' in window
}

export function isElectron() {
  return false
}

export function isDesktopApp() {
  return true
}
