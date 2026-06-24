import type {
  ManagedPc,
  PcApiResult,
  PcConnectionStatus,
  RemoteOperationResult,
} from '@/types/pc'

const API_BASE = 'http://127.0.0.1:9876/api'

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
      return { status: 'error', error: text || response.statusText }
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

  saveManagedPcs(pcs: ManagedPc[]): Promise<PcApiResult<null>> {
    return request<null>('/pcs', {
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
    localPath: string,
    remoteDir: string
  ): Promise<PcApiResult<RemoteOperationResult[]>> {
    return request<RemoteOperationResult[]>('/deploy', {
      method: 'POST',
      body: JSON.stringify({ pcs, localPath, remoteDir }),
    })
  },

  async pickFile(): Promise<PcApiResult<string | null>> {
    try {
      const input = document.createElement('input')
      input.type = 'file'

      const file = await new Promise<File | null>(resolve => {
        input.onchange = () => resolve(input.files?.[0] ?? null)
        input.click()
      })

      if (!file) {
        return { status: 'ok', data: null }
      }

      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        return { status: 'error', error: 'Dosya yüklenemedi' }
      }

      const payload = (await response.json()) as { path: string }
      return { status: 'ok', data: payload.path }
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
