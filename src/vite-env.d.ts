/// <reference types="vite/client" />

declare const __APP_VERSION__: string

interface OfisDesktopApi {
  loadManagedPcs: () => Promise<import('./types/pc').ManagedPc[]>
  saveManagedPcs: (pcs: import('./types/pc').ManagedPc[]) => Promise<void>
  checkPcConnections: (
    pcs: import('./types/pc').ManagedPc[]
  ) => Promise<import('./types/pc').PcConnectionStatus[]>
  runRemoteCommand: (
    pcs: import('./types/pc').ManagedPc[],
    command: string
  ) => Promise<import('./types/pc').RemoteOperationResult[]>
  deployFileToPcs: (
    pcs: import('./types/pc').ManagedPc[],
    localPath: string,
    remoteDir: string
  ) => Promise<import('./types/pc').RemoteOperationResult[]>
  pickFile: () => Promise<string | null>
  pickFolder: () => Promise<string | null>
}

interface Window {
  ofisApi?: OfisDesktopApi
}
