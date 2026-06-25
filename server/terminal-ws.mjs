import {
  loadManagedPcs,
  runTerminalBanner,
  runTerminalComplete,
  runTerminalPrompt,
  runTerminalShell,
} from './remote.mjs'

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload))
  }
}

export function setupTerminalWebSocket(wss) {
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const pcId = url.searchParams.get('pcId')
    let pc = null
    let busy = false

    const init = async () => {
      if (!pcId) {
        send(ws, { type: 'error', data: 'pcId parametresi gerekli' })
        ws.close()
        return
      }

      const pcs = await loadManagedPcs()
      pc = pcs.find(item => item.id === pcId) ?? null
      if (!pc) {
        send(ws, { type: 'error', data: 'PC bulunamadi' })
        ws.close()
        return
      }

      try {
        const banner = await runTerminalBanner(pc)
        const prompt = await runTerminalPrompt(pc)
        send(ws, {
          type: 'ready',
          pcName: pc.name,
          address: pc.address,
          banner: banner.output ?? '',
          prompt: prompt.output ?? 'PS> ',
        })
      } catch (error) {
        send(ws, { type: 'error', data: error.message })
        ws.close()
      }
    }

    void init()

    ws.on('message', async raw => {
      if (!pc) return

      let msg
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }

      if (msg.type === 'complete') {
        const line = String(msg.line ?? '')
        const cursor = Number.isFinite(msg.cursor)
          ? Number(msg.cursor)
          : line.length
        try {
          const data = await runTerminalComplete(pc, line, cursor)
          send(ws, {
            type: 'complete',
            replacementIndex: data.replacementIndex ?? 0,
            replacementLength: data.replacementLength ?? 0,
            currentMatch: data.currentMatch ?? '',
            matches: Array.isArray(data.matches) ? data.matches : [],
          })
        } catch (error) {
          send(ws, { type: 'error', data: error.message })
        }
        return
      }

      if (msg.type !== 'command' || busy) return

      const line = (msg.line ?? '').trim()
      if (!line) {
        try {
          const prompt = await runTerminalPrompt(pc)
          send(ws, { type: 'prompt', data: prompt.output ?? 'PS> ' })
        } catch (error) {
          send(ws, { type: 'error', data: error.message })
        }
        return
      }

      if (line.toLowerCase() === 'exit') {
        send(ws, { type: 'output', data: 'Oturum kapatildi.' })
        ws.close()
        return
      }

      busy = true
      try {
        const result = await runTerminalShell(pc, line)
        if (result.output) {
          send(ws, { type: 'output', data: result.output })
        }
        const prompt = await runTerminalPrompt(pc)
        send(ws, { type: 'prompt', data: prompt.output ?? 'PS> ' })
      } catch (error) {
        send(ws, { type: 'error', data: error.message })
        try {
          const prompt = await runTerminalPrompt(pc)
          send(ws, { type: 'prompt', data: prompt.output ?? 'PS> ' })
        } catch {
          // ignore prompt errors after command failure
        }
      } finally {
        busy = false
      }
    })
  })
}
