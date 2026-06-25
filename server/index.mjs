import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import * as remote from './remote.mjs'
import { syncTrustedHosts } from './trusted-hosts.mjs'
import { setupTerminalWebSocket } from './terminal-ws.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadDir = path.join(os.tmpdir(), 'ofis-yonetim-uploads')

function safeBaseName(name) {
  const base = path.basename(name || 'dosya')
  const cleaned = base.replace(/[<>:"|?*\x00-\x1f]/g, '_').trim()
  return cleaned || 'dosya'
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => {
      cb(null, `${randomUUID()}_${safeBaseName(file.originalname)}`)
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
})

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: 2 })
})

app.get('/api/pcs', async (_req, res) => {
  res.json(await remote.loadManagedPcs())
})

app.post('/api/pcs', async (req, res) => {
  const pcs = req.body
  await remote.saveManagedPcs(pcs)
  const trustedHosts = await syncTrustedHosts(pcs.map(pc => pc.address))
  res.json({ ok: true, trustedHosts })
})

app.post('/api/pcs/check', async (req, res) => {
  res.json(await remote.checkPcConnections(req.body))
})

app.post('/api/command', async (req, res) => {
  const { pcs, command } = req.body
  res.json(await remote.runRemoteCommand(pcs, command))
})

app.post('/api/deploy', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Dosya gerekli' })
    return
  }

  let pcs
  try {
    pcs = JSON.parse(req.body.pcs)
  } catch {
    res.status(400).json({ error: 'PC listesi geçersiz' })
    return
  }

  const remoteDir = req.body.remoteDir?.trim()
  if (!remoteDir) {
    res.status(400).json({ error: 'Hedef klasör gerekli' })
    return
  }

  const fileName = safeBaseName(req.file.originalname)
  const localPath = req.file.path
  const streamProgress =
    req.query.stream === '1' || req.headers['x-stream-progress'] === '1'

  const cleanup = () => fs.unlink(localPath).catch(() => {})

  if (streamProgress) {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()

    const emit = event => {
      res.write(`${JSON.stringify(event)}\n`)
    }

    try {
      emit({ type: 'phase', message: 'Uzak PC\'lere kopyalanıyor...' })
      const results = await remote.deployFileToPcsStreaming(
        pcs,
        localPath,
        remoteDir,
        fileName,
        emit
      )
      emit({ type: 'complete', results })
    } catch (error) {
      emit({ type: 'error', error: error.message })
    } finally {
      await cleanup()
      res.end()
    }
    return
  }

  try {
    res.json(
      await remote.deployFileToPcs(pcs, localPath, remoteDir, fileName)
    )
  } finally {
    await cleanup()
  }
})

app.get('/api/credentials', async (_req, res) => {
  const stored = await remote.loadWinRmCredentials()
  if (!stored) {
    res.json({ username: '', password: '' })
    return
  }
  res.json({
    username: stored.username ?? '',
    password: stored.password ?? '',
  })
})

app.post('/api/credentials', async (req, res) => {
  const { username, password } = req.body
  if (!username?.trim() || !password) {
    res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' })
    return
  }
  await remote.saveWinRmCredentials({
    username: username.trim(),
    password,
  })
  res.json({ ok: true })
})

app.post('/api/browse', async (req, res) => {
  const { pc, path: dirPath, includeFiles } = req.body
  if (!pc?.address) {
    res.status(400).json({ error: 'PC gerekli' })
    return
  }

  const result = await remote.browseRemoteDirectory(pc, dirPath ?? '', {
    includeFiles: Boolean(includeFiles),
  })
  if (!result.success) {
    res.status(400).json({
      error: result.error,
      debug: result.debug ?? null,
    })
    return
  }
  res.json(result.data)
})

app.post('/api/desktop-path', async (req, res) => {
  const { pc } = req.body
  if (!pc?.address) {
    res.status(400).json({ error: 'PC gerekli' })
    return
  }

  try {
    const path = await remote.getRemoteDesktopPath(pc)
    if (!path) {
      res.status(400).json({ error: 'Masaustu yolu alinamadi' })
      return
    }
    res.json({ path })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

app.post('/api/fetch', async (req, res) => {
  const { pcs, remotePath, localDir } = req.body
  if (!Array.isArray(pcs) || pcs.length === 0) {
    res.status(400).json({ error: 'En az bir PC gerekli' })
    return
  }
  if (!remotePath?.trim()) {
    res.status(400).json({ error: 'Uzak dosya yolu gerekli' })
    return
  }

  try {
    res.json(
      await remote.fetchFileFromPcs(pcs, remotePath.trim(), localDir?.trim())
    )
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

app.post('/api/pick-folder', async (_req, res) => {
  try {
    const selected = await remote.pickFolderDialog()
    if (!selected) {
      res.json({ cancelled: true })
      return
    }
    res.json({ path: selected })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

app.get('/api/downloads-dir', (_req, res) => {
  res.json({ path: remote.getDownloadsDirectory() })
})

const PORT = 9876

await fs.mkdir(uploadDir, { recursive: true })

const existingPcs = await remote.loadManagedPcs()
if (existingPcs.length > 0) {
  const trustedHosts = await syncTrustedHosts(existingPcs.map(pc => pc.address))
  if (!trustedHosts.success) {
    console.error(
      '[trusted-hosts] Baslangic senkronu basarisiz:',
      trustedHosts.error
    )
  } else if (trustedHosts.added.length > 0) {
    console.error(
      '[trusted-hosts] Eklendi:',
      trustedHosts.added.join(', ')
    )
  }
}

const server = createServer(app)
const wss = new WebSocketServer({ server, path: '/ws/terminal' })
setupTerminalWebSocket(wss)

server.listen(PORT, () => {
  console.log(`Ofis Yonetim API http://127.0.0.1:${PORT}`)
  console.log(`Terminal WebSocket ws://127.0.0.1:${PORT}/ws/terminal`)
})
