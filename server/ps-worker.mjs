import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const workerScript = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'winrm-worker.ps1'
)

class PowerShellWorker {
  constructor() {
    this.proc = null
    this.buffer = ''
    this.pending = new Map()
    this.readyPromise = null
    this.starting = false
  }

  start() {
    if (this.proc || this.starting) return this.readyPromise
    this.starting = true

    this.readyPromise = new Promise((resolve, reject) => {
      this.proc = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Sta', '-File', workerScript],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
      )

      const fail = error => {
        this.starting = false
        reject(error)
      }

      this.proc.on('error', fail)
      this.proc.stderr.on('data', chunk => {
        console.error(`[winrm-worker] ${chunk.toString()}`)
      })

      this.proc.stdout.on('data', chunk => {
        this.buffer += chunk.toString('utf8')
        let newlineIndex = this.buffer.indexOf('\n')
        while (newlineIndex >= 0) {
          const line = this.buffer.slice(0, newlineIndex).trim()
          this.buffer = this.buffer.slice(newlineIndex + 1)
          if (line) this.handleLine(line, resolve, fail)
          newlineIndex = this.buffer.indexOf('\n')
        }
      })

      this.proc.on('close', code => {
        this.proc = null
        this.starting = false
        this.readyPromise = null
        const error = new Error(`WinRM worker kapandi (kod ${code})`)
        for (const { reject: rejectPending } of this.pending.values()) {
          rejectPending(error)
        }
        this.pending.clear()
      })
    })

    return this.readyPromise
  }

  handleLine(line, resolveReady, rejectReady) {
    let payload
    try {
      payload = JSON.parse(line)
    } catch {
      return
    }

    if (payload.ready) {
      this.starting = false
      resolveReady()
      return
    }

    if (!payload.id) return

    const pending = this.pending.get(payload.id)
    if (!pending) return

    this.pending.delete(payload.id)
    if (payload.success) {
      pending.resolve(payload)
    } else {
      pending.reject(new Error(payload.error || 'WinRM worker hatasi'))
    }
  }

  async request(payload, timeoutMs = 120_000) {
    await this.start()

    if (!this.proc) {
      throw new Error('WinRM worker baslatilamadi')
    }

    return new Promise((resolve, reject) => {
      const id = randomUUID()
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('WinRM istegi zaman asimina ugradi'))
      }, timeoutMs)

      this.pending.set(id, {
        resolve: value => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: error => {
          clearTimeout(timer)
          reject(error)
        },
      })

      this.proc.stdin.write(`${JSON.stringify({ ...payload, id })}\n`, 'utf8')
    })
  }
}

export const psWorker = new PowerShellWorker()
