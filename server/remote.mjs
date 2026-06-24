import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

function escapePsSingleQuoted(value) {
  return value.replace(/'/g, "''")
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

function pcsPath() {
  return path.join(os.homedir(), '.ofis-yonetim', 'managed_pcs.json')
}

export async function loadManagedPcs() {
  try {
    const contents = await fs.readFile(pcsPath(), 'utf-8')
    return JSON.parse(contents)
  } catch {
    return []
  }
}

export async function saveManagedPcs(pcs) {
  const filePath = pcsPath()
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(pcs, null, 2), 'utf-8')
}

function invokeOnHost(address, userScript) {
  const escapedAddress = escapePsSingleQuoted(address)
  const escapedScript = escapePsSingleQuoted(userScript)

  const script = `
$ErrorActionPreference = 'Stop'
try {
  $result = Invoke-Command -ComputerName '${escapedAddress}' -ScriptBlock ([scriptblock]::Create('${escapedScript}')) -ErrorAction Stop
  if ($null -eq $result) { 'OK (çıktı yok)' } else { ($result | Out-String).Trim() }
} catch {
  $_.Exception.Message
  exit 1
}
`

  return runPowershell(script)
}

function copyFileToHost(address, localPath, remoteDir) {
  const escapedAddress = escapePsSingleQuoted(address)
  const escapedLocalPath = escapePsSingleQuoted(localPath)
  const escapedRemoteDir = escapePsSingleQuoted(remoteDir.replace(/\\+$/, ''))

  const script = `
$ErrorActionPreference = 'Stop'
try {
  $session = New-PSSession -ComputerName '${escapedAddress}'
  $fileName = Split-Path -Leaf '${escapedLocalPath}'
  $dest = '${escapedRemoteDir}\\' + $fileName
  Copy-Item -LiteralPath '${escapedLocalPath}' -Destination $dest -ToSession $session -Force
  Remove-PSSession $session
  "Dosya kopyalandı: $dest"
} catch {
  $_.Exception.Message
  exit 1
}
`

  return runPowershell(script)
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
      const { success, output } = await invokeOnHost(pc.address, command)
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

export async function deployFileToPcs(pcs, localPath, remoteDir) {
  try {
    await fs.access(localPath)
  } catch {
    throw new Error(`Dosya bulunamadı: ${localPath}`)
  }

  return Promise.all(
    pcs.map(async pc => {
      const { success, output } = await copyFileToHost(
        pc.address,
        localPath,
        remoteDir || 'C:\\Temp'
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
