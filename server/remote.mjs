import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { psWorker } from './ps-worker.mjs'

function logApi(level, message, meta = {}) {
  const suffix =
    Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : ''
  const line = `[${new Date().toISOString()}] [${level}] ${message}${suffix}`
  console.error(line)

  const logPath = path.join(configDir(), 'logs', 'api.log')
  fs.mkdir(path.dirname(logPath), { recursive: true })
    .then(() => fs.appendFile(logPath, `${line}\n`, 'utf-8'))
    .catch(() => {})
}

function normalizeList(value) {
  if (Array.isArray(value)) return value
  if (value) return [value]
  return []
}

function escapePsSingleQuoted(value) {
  return value.replace(/'/g, "''")
}

const browseCache = new Map()
const BROWSE_CACHE_MS = 120_000

function browseCacheKey(address, dirPath) {
  return `${address}::${dirPath || ''}`
}

function getBrowseCache(address, dirPath) {
  const entry = browseCache.get(browseCacheKey(address, dirPath))
  if (!entry || Date.now() - entry.at > BROWSE_CACHE_MS) return null
  return entry.data
}

function setBrowseCache(address, dirPath, data) {
  browseCache.set(browseCacheKey(address, dirPath), {
    at: Date.now(),
    data,
  })
}

export function clearBrowseCache(address) {
  if (!address) {
    browseCache.clear()
    return
  }
  for (const key of browseCache.keys()) {
    if (key.startsWith(`${address}::`)) browseCache.delete(key)
  }
}

async function workerInvoke(address, credentials, script) {
  const response = await psWorker.request({
    op: 'invoke',
    address,
    username: credentials.username,
    password: credentials.password,
    script,
  })
  return { success: true, output: response.output || 'OK' }
}

async function workerBrowse(address, credentials, dirPath, includeFiles = false) {
  const response = await psWorker.request({
    op: 'browse',
    address,
    username: credentials.username,
    password: credentials.password,
    path: dirPath ?? '',
    includeFiles,
  })
  return response.data
}

async function workerFetch(address, credentials, remotePath, localPath) {
  const response = await psWorker.request(
    {
      op: 'fetch',
      address,
      username: credentials.username,
      password: credentials.password,
      remotePath,
      localPath,
    },
    300_000
  )
  return { success: true, output: response.output || 'OK' }
}

async function workerCopy(address, credentials, localPath, remoteDir, fileName) {
  const response = await psWorker.request({
    op: 'copy',
    address,
    username: credentials.username,
    password: credentials.password,
    localPath,
    remoteDir: remoteDir.replace(/\\+$/, ''),
    fileName,
  })
  return { success: true, output: response.output || 'OK' }
}

function runPowershell(script) {
  return new Promise(resolve => {
    const ps = spawn(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true }
    )

    let stdout = ''
    let stderr = ''

    ps.stdout.on('data', chunk => {
      stdout += chunk.toString()
    })
    ps.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })

    ps.on('close', code => {
      stdout = stdout.trim()
      stderr = stderr.trim()

      if (code === 0) {
        const output =
          stdout && stderr ? `${stdout}\n${stderr}`.trim() : stdout || stderr
        resolve({ success: true, output: output || 'OK' })
      } else {
        resolve({
          success: false,
          output: stderr || stdout || 'Komut başarısız oldu',
        })
      }
    })

    ps.on('error', error => {
      resolve({
        success: false,
        output: `PowerShell başlatılamadı: ${error.message}`,
      })
    })
  })
}

function configDir() {
  return path.join(os.homedir(), '.ofis-yonetim')
}

function pcsPath() {
  return path.join(configDir(), 'managed_pcs.json')
}

function credentialsPath() {
  return path.join(configDir(), 'winrm_credentials.json')
}

export async function loadWinRmCredentials() {
  try {
    const contents = await fs.readFile(credentialsPath(), 'utf-8')
    const stored = JSON.parse(contents)
    return {
      username: shortUsername(stored),
      password: stored.password ?? '',
    }
  } catch {
    return null
  }
}

export async function saveWinRmCredentials(credentials) {
  const filePath = credentialsPath()
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        username: shortUsername(credentials),
        password: credentials.password,
      },
      null,
      2
    ),
    'utf-8'
  )
}

function shortUsername(credentials) {
  const raw = (credentials?.username || '').trim()
  if (!raw) return ''
  if (raw.includes('\\')) return raw.split('\\').pop()?.trim() || raw
  return raw
}

function migratePc(pc) {
  let hostname = pc.hostname?.trim() || null
  if (!hostname && pc.winrm_username?.includes('\\')) {
    hostname = pc.winrm_username.split('\\')[0]?.trim() || null
  }
  return {
    id: pc.id,
    name: pc.name,
    address: pc.address,
    notes: pc.notes ?? null,
    hostname,
  }
}

async function resolveCredentials(pc) {
  const stored = await loadWinRmCredentials()
  if (!stored?.password) return null

  const user = shortUsername(stored)
  const hostname = (pc.hostname || '').trim()
  if (!user) return null
  if (!hostname) return null

  return { username: `${hostname}\\${user}`, password: stored.password }
}

export async function loadManagedPcs() {
  try {
    const contents = await fs.readFile(pcsPath(), 'utf-8')
    const pcs = JSON.parse(contents)
    return pcs.map(migratePc)
  } catch {
    return []
  }
}

export async function saveManagedPcs(pcs) {
  const filePath = pcsPath()
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(pcs, null, 2), 'utf-8')
}

function invokeOnHost(address, userScript, credentials) {
  return workerInvoke(address, credentials, userScript).catch(error => ({
    success: false,
    output: error.message,
  }))
}

function copyFileToHost(address, localPath, remoteDir, fileName, credentials) {
  return workerCopy(address, credentials, localPath, remoteDir, fileName).catch(
    error => ({
      success: false,
      output: error.message,
    })
  )
}

function fetchFileFromHost(address, remotePath, localPath, credentials) {
  return workerFetch(address, credentials, remotePath, localPath).catch(error => ({
    success: false,
    output: error.message,
  }))
}

function downloadsDir() {
  return path.join(configDir(), 'downloads')
}

function safePcFileName(name) {
  return (name || 'pc').replace(/[<>:"|?*\x00-\x1f\\/]/g, '_').trim() || 'pc'
}

function safeBaseName(name) {
  return (name || 'dosya').replace(/[<>:"|?*\x00-\x1f\\/]/g, '_').trim() || 'dosya'
}

export async function browseRemoteDirectory(pc, dirPath, options = {}) {
  const credentials = await resolveCredentials(pc)
  if (!credentials) {
    return {
      success: false,
      error:
        'WinRM kimlik bilgisi ayarlanmamış. Kimlik Bilgileri bölümünü doldurun.',
    }
  }

  const includeFiles = Boolean(options.includeFiles)
  const targetPath = dirPath ?? ''
  const cacheKeySuffix = includeFiles ? '::files' : ''
  const cached = getBrowseCache(pc.address, targetPath + cacheKeySuffix)
  if (cached) {
    logApi('info', 'browse:cache-hit', {
      pc: pc.name,
      path: targetPath,
      includeFiles,
    })
    return { success: true, data: cached }
  }

  logApi('info', 'browse:start', {
    pc: pc.name,
    address: pc.address,
    path: targetPath,
    includeFiles,
  })

  try {
    const raw = await workerBrowse(pc.address, credentials, targetPath, includeFiles)
    const data = {
      path: raw.path ?? '',
      parent: raw.parent ?? null,
      entries: normalizeList(raw.entries),
      quick_folders: normalizeList(raw.quick_folders),
    }
    setBrowseCache(pc.address, targetPath + cacheKeySuffix, data)
    logApi('info', 'browse:ok', {
      pc: pc.name,
      path: data.path,
      entryCount: data.entries.length,
    })
    return { success: true, data }
  } catch (error) {
    logApi('error', 'browse:failed', {
      pc: pc.name,
      address: pc.address,
      path: targetPath,
      message: error.message,
    })
    return { success: false, error: error.message }
  }
}

export async function checkPcConnections(pcs) {
  return Promise.all(
    pcs.map(async pc => {
      const escapedAddress = escapePsSingleQuoted(pc.address)
      const script = `if (Test-Connection -ComputerName '${escapedAddress}' -Count 1 -Quiet) { 'online' } else { 'offline' }`
      const { success, output } = await runPowershell(script)
      const online = success && output.toLowerCase().includes('online')

      return {
        pc_id: pc.id,
        pc_name: pc.name,
        address: pc.address,
        online,
        message: online ? 'Erişilebilir' : output,
      }
    })
  )
}

export async function runRemoteCommand(pcs, command) {
  return Promise.all(
    pcs.map(async pc => {
      const credentials = await resolveCredentials(pc)
      if (!credentials) {
        return {
          pc_id: pc.id,
          pc_name: pc.name,
          address: pc.address,
          success: false,
          output:
            'WinRM kimlik bilgisi ayarlanmamış. Üst menüden Kimlik Bilgileri bölümünü doldurun.',
        }
      }

      const { success, output } = await invokeOnHost(
        pc.address,
        command,
        credentials
      )
      return {
        pc_id: pc.id,
        pc_name: pc.name,
        address: pc.address,
        success,
        output,
      }
    })
  )
}

async function workerShell(address, credentials, line) {
  const response = await psWorker.request(
    {
      op: 'shell',
      address,
      username: credentials.username,
      password: credentials.password,
      line,
    },
    300_000
  )
  return { success: true, output: response.output ?? '' }
}

async function workerTerminalMeta(address, credentials, op) {
  const response = await psWorker.request({
    op,
    address,
    username: credentials.username,
    password: credentials.password,
  })
  return { success: true, output: response.output ?? '' }
}

export async function runTerminalShell(pc, line) {
  const credentials = await resolveCredentials(pc)
  if (!credentials) {
    throw new Error(
      'WinRM kimlik bilgisi ayarlanmamis. Kimlik Bilgileri bolumunu doldurun.'
    )
  }
  return workerShell(pc.address, credentials, line)
}

export async function runTerminalBanner(pc) {
  const credentials = await resolveCredentials(pc)
  if (!credentials) {
    throw new Error(
      'WinRM kimlik bilgisi ayarlanmamis. Kimlik Bilgileri bolumunu doldurun.'
    )
  }
  return workerTerminalMeta(pc.address, credentials, 'banner')
}

export async function runTerminalPrompt(pc) {
  const credentials = await resolveCredentials(pc)
  if (!credentials) {
    throw new Error(
      'WinRM kimlik bilgisi ayarlanmamis. Kimlik Bilgileri bolumunu doldurun.'
    )
  }
  return workerTerminalMeta(pc.address, credentials, 'prompt')
}

async function workerComplete(address, credentials, line, cursor) {
  const response = await psWorker.request({
    op: 'complete',
    address,
    username: credentials.username,
    password: credentials.password,
    line,
    cursor,
  })
  return response.data ?? {
    currentMatch: '',
    replacementIndex: 0,
    replacementLength: 0,
    matches: [],
  }
}

export async function getRemoteDesktopPath(pc) {
  const credentials = await resolveCredentials(pc)
  if (!credentials) {
    throw new Error(
      'WinRM kimlik bilgisi ayarlanmamis. Kimlik Bilgileri bolumunu doldurun.'
    )
  }
  const response = await psWorker.request({
    op: 'desktop',
    address: pc.address,
    username: credentials.username,
    password: credentials.password,
  })
  return (response.output ?? '').trim()
}

export async function runTerminalComplete(pc, line, cursor) {
  const credentials = await resolveCredentials(pc)
  if (!credentials) {
    throw new Error(
      'WinRM kimlik bilgisi ayarlanmamis. Kimlik Bilgileri bolumunu doldurun.'
    )
  }
  return workerComplete(pc.address, credentials, line, cursor)
}

async function deployFileToSinglePc(pc, localPath, remoteDir, fileName) {
  const credentials = await resolveCredentials(pc)
  if (!credentials) {
    return {
      pc_id: pc.id,
      pc_name: pc.name,
      address: pc.address,
      success: false,
      output:
        'WinRM kimlik bilgisi ayarlanmamış. Üst menüden Kimlik Bilgileri bölümünü doldurun.',
    }
  }

  const { success, output } = await copyFileToHost(
    pc.address,
    localPath,
    remoteDir,
    fileName,
    credentials
  )
  return {
    pc_id: pc.id,
    pc_name: pc.name,
    address: pc.address,
    success,
    output,
  }
}

export async function deployFileToPcs(pcs, localPath, remoteDir, fileName) {
  try {
    await fs.access(localPath)
  } catch {
    throw new Error(`Dosya bulunamadı: ${localPath}`)
  }

  return Promise.all(
    pcs.map(pc => deployFileToSinglePc(pc, localPath, remoteDir, fileName))
  )
}

export async function deployFileToPcsStreaming(
  pcs,
  localPath,
  remoteDir,
  fileName,
  emit
) {
  try {
    await fs.access(localPath)
  } catch {
    throw new Error(`Dosya bulunamadı: ${localPath}`)
  }

  const results = []
  const total = pcs.length

  for (let index = 0; index < pcs.length; index++) {
    const pc = pcs[index]
    emit({
      type: 'pc-start',
      pc_id: pc.id,
      pc_name: pc.name,
      index: index + 1,
      total,
    })

    const result = await deployFileToSinglePc(pc, localPath, remoteDir, fileName)
    results.push(result)
    emit({
      type: 'pc-done',
      result,
      index: index + 1,
      total,
    })
  }

  return results
}

export async function fetchFileFromPcs(pcs, remoteFilePath, localDir) {
  const remotePath = remoteFilePath?.trim()
  if (!remotePath) {
    throw new Error('Uzak dosya yolu gerekli')
  }

  const downloadRoot = path.resolve(
    localDir?.trim() || downloadsDir()
  )
  await fs.mkdir(downloadRoot, { recursive: true })

  const baseName = safeBaseName(path.basename(remotePath))
  const multi = pcs.length > 1

  return Promise.all(
    pcs.map(async pc => {
      const credentials = await resolveCredentials(pc)
      if (!credentials) {
        return {
          pc_id: pc.id,
          pc_name: pc.name,
          address: pc.address,
          success: false,
          output:
            'WinRM kimlik bilgisi ayarlanmamış. Üst menüden Kimlik Bilgileri bölümünü doldurun.',
        }
      }

      const localName = multi
        ? `${safePcFileName(pc.name)}_${baseName}`
        : baseName
      const localPath = path.join(downloadRoot, localName)

      const { success, output } = await fetchFileFromHost(
        pc.address,
        remotePath,
        localPath,
        credentials
      )
      return {
        pc_id: pc.id,
        pc_name: pc.name,
        address: pc.address,
        success,
        output,
      }
    })
  )
}

export function getDownloadsDirectory() {
  return downloadsDir()
}

export async function pickFolderDialog() {
  if (process.platform !== 'win32') {
    throw new Error('Klasör seçici yalnızca Windows üzerinde desteklenir')
  }

  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execFileAsync = promisify(execFile)

  const script = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Kayit klasoru secin'
$dialog.ShowNewFolderButton = $true
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.SelectedPath
}
`

  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-STA', '-Command', script],
    { windowsHide: false, timeout: 300_000 }
  )

  const selected = stdout.trim()
  return selected || null
}
