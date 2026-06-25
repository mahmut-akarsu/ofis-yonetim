import { spawn } from 'node:child_process'

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
        resolve({
          success: true,
          output: stdout || stderr || '',
        })
      } else {
        resolve({
          success: false,
          output: stderr || stdout || 'PowerShell komutu basarisiz oldu',
        })
      }
    })

    ps.on('error', error => {
      resolve({
        success: false,
        output: `PowerShell baslatilamadi: ${error.message}`,
      })
    })
  })
}

export async function getTrustedHosts() {
  const { success, output } = await runPowershell(
    `(Get-Item WSMan:\\localhost\\Client\\TrustedHosts).Value`
  )
  if (!success) {
    return { success: false, error: output, value: '' }
  }
  return { success: true, value: output || '' }
}

/** Kayıtlı PC IP'lerini yönetim PC TrustedHosts listesine ekler. */
export async function syncTrustedHosts(addresses) {
  const ips = [
    ...new Set(
      addresses
        .map(address => String(address || '').trim())
        .filter(address => address.length > 0)
    ),
  ]

  if (ips.length === 0) {
    return { success: true, value: '', added: [] }
  }

  const psArray = ips.map(ip => `'${escapePsSingleQuoted(ip)}'`).join(',')

  const script = `
$ErrorActionPreference = 'Stop'
try {
  Start-Service WinRM -ErrorAction SilentlyContinue | Out-Null
  $newIps = @(${psArray})
  $item = Get-Item WSMan:\\localhost\\Client\\TrustedHosts
  $current = [string]$item.Value
  if ($current -eq '*') {
    'WILDCARD'
    exit 0
  }
  $list = @()
  if ($current) {
    $list = @($current -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  }
  $added = @()
  foreach ($ip in $newIps) {
    if ($list -notcontains $ip) {
      $list += $ip
      $added += $ip
    }
  }
  $value = ($list -join ',').Trim()
  if ($value) {
    Set-Item WSMan:\\localhost\\Client\\TrustedHosts -Value $value -Force
  }
  if ($added.Count -eq 0) { 'NONE' } else { ($added -join '|') }
} catch {
  $_.Exception.Message
  exit 1
}
`

  const { success, output } = await runPowershell(script)
  if (!success) {
    return {
      success: false,
      error: output,
      added: [],
      hint: 'API\'yi yonetici olarak calistirin (PowerShell\'i Yonetici olarak acip npm run start).',
    }
  }

  if (output === 'WILDCARD') {
    return { success: true, value: '*', added: [] }
  }

  const added =
    output === 'NONE' || !output ? [] : output.split('|').filter(Boolean)

  const current = await getTrustedHosts()
  return {
    success: true,
    value: current.value,
    added,
  }
}
