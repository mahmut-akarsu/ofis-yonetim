import express from 'express'
import cors from 'cors'
import multer from 'multer'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import * as remote from './remote.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadDir = path.join(os.tmpdir(), 'ofis-yonetim-uploads')
const upload = multer({ dest: uploadDir })

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/pcs', async (_req, res) => {
  res.json(await remote.loadManagedPcs())
})

app.post('/api/pcs', async (req, res) => {
  await remote.saveManagedPcs(req.body)
  res.json({ ok: true })
})

app.post('/api/pcs/check', async (req, res) => {
  res.json(await remote.checkPcConnections(req.body))
})

app.post('/api/command', async (req, res) => {
  const { pcs, command } = req.body
  res.json(await remote.runRemoteCommand(pcs, command))
})

app.post('/api/deploy', async (req, res) => {
  const { pcs, localPath, remoteDir } = req.body
  res.json(await remote.deployFileToPcs(pcs, localPath, remoteDir))
})

app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Dosya gerekli' })
    return
  }
  res.json({ path: req.file.path, originalName: req.file.originalname })
})

const PORT = 9876

await fs.mkdir(uploadDir, { recursive: true })

app.listen(PORT, () => {
  console.log(`Ofis Yonetim API http://127.0.0.1:${PORT}`)
})
