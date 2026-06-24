export type ManagedPc = {
  id: string
  name: string
  address: string
  notes: string | null
}

export type RemoteOperationResult = {
  pc_id: string
  pc_name: string
  address: string
  success: boolean
  output: string
}

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
