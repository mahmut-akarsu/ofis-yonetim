import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as remote from './remote.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    title: 'Ofis Yonetim',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:1420')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  ipcMain.handle('load-managed-pcs', () => remote.loadManagedPcs())
  ipcMain.handle('save-managed-pcs', (_event, pcs) => remote.saveManagedPcs(pcs))
  ipcMain.handle('check-pc-connections', (_event, pcs) =>
    remote.checkPcConnections(pcs)
  )
  ipcMain.handle('run-remote-command', (_event, { pcs, command }) =>
    remote.runRemoteCommand(pcs, command)
  )
  ipcMain.handle('deploy-file', (_event, { pcs, localPath, remoteDir }) =>
    remote.deployFileToPcs(pcs, localPath, remoteDir)
  )
  ipcMain.handle('pick-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })
  ipcMain.handle('pick-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
