export type ManagedPc = {
  id: string
  name: string
  address: string
  notes: string | null
  /** Uzak PC Windows adı, örn. DESKTOP-CNT7 */
  hostname: string | null
}

export type WinRmCredentials = {
  /** Kısa kullanıcı adı, örn. ofisadmin */
  username: string
  password: string
}

export type TrustedHostsSyncResult = {
  success: boolean
  value?: string
  added?: string[]
  error?: string
  hint?: string
}

export type SavePcsResult = {
  ok: boolean
  trustedHosts: TrustedHostsSyncResult
}

export type RemoteBrowseEntry = {
  name: string
  path: string
  type: 'drive' | 'folder' | 'file'
  size_bytes?: number
}

export type RemoteBrowseResult = {
  path: string
  parent: string | null
  entries: RemoteBrowseEntry[]
  quick_folders: { label: string; path: string }[]
}

export type RemoteOperationResult = {
  pc_id: string
  pc_name: string
  address: string
  success: boolean
  output: string
}

export type DeployProgressEvent =
  | { type: 'upload'; loaded: number; total: number }
  | { type: 'phase'; message: string }
  | {
      type: 'pc-start'
      pc_id: string
      pc_name: string
      index: number
      total: number
    }
  | {
      type: 'pc-done'
      result: RemoteOperationResult
      index: number
      total: number
    }
  | { type: 'complete'; results: RemoteOperationResult[] }
  | { type: 'error'; error: string }

export type PcConnectionStatus = {
  pc_id: string
  pc_name: string
  address: string
  online: boolean
  message: string
}

export type PcApiResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'error'; error: string }
