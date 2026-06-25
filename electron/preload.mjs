import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('ofisApi', {
  loadManagedPcs: () => ipcRenderer.invoke('load-managed-pcs'),
  saveManagedPcs: pcs => ipcRenderer.invoke('save-managed-pcs', pcs),
  checkPcConnections: pcs => ipcRenderer.invoke('check-pc-connections', pcs),
  runRemoteCommand: (pcs, command) =>
    ipcRenderer.invoke('run-remote-command', { pcs, command }),
  deployFileToPcs: (pcs, localPath, remoteDir) =>
    ipcRenderer.invoke('deploy-file', { pcs, localPath, remoteDir }),
  pickFile: () => ipcRenderer.invoke('pick-file'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
})
