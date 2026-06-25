import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { ManagedPc } from '@/types/pc'
import { cn } from '@/lib/utils'

const WS_BASE = 'ws://127.0.0.1:9876/ws/terminal'

interface RemoteTerminalProps {
  pc: ManagedPc | null
  credentialsReady: boolean
  className?: string
}

interface CompletionState {
  active: boolean
  pressCount: number
  replacementIndex: number
  replacementLength: number
  matches: string[]
}

interface CompleteMessage {
  type: 'complete'
  replacementIndex?: number
  replacementLength?: number
  currentMatch?: string
  matches?: string[]
}

function longestCommonPrefix(values: string[]): string {
  if (values.length === 0) return ''
  let prefix = values[0]!
  for (const value of values.slice(1)) {
    while (prefix && !value.startsWith(prefix)) {
      prefix = prefix.slice(0, -1)
    }
    if (!prefix) return ''
  }
  return prefix
}

export function RemoteTerminal({
  pc,
  credentialsReady,
  className,
}: RemoteTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const lineRef = useRef('')
  const promptRef = useRef('PS> ')
  const connectedPcIdRef = useRef<string | null>(null)
  const connectionGenRef = useRef(0)
  const completionRef = useRef<CompletionState>({
    active: false,
    pressCount: 0,
    replacementIndex: 0,
    replacementLength: 0,
    matches: [],
  })

  const resetCompletion = useCallback(() => {
    completionRef.current = {
      active: false,
      pressCount: 0,
      replacementIndex: 0,
      replacementLength: 0,
      matches: [],
    }
  }, [])

  const refreshCurrentLine = useCallback(() => {
    const term = termRef.current
    if (!term) return
    term.write(`\r\x1b[33m${promptRef.current}\x1b[0m${lineRef.current}\x1b[K`)
  }, [])

  const applyCompletion = useCallback(
    (text: string) => {
      const state = completionRef.current
      const before = lineRef.current.slice(0, state.replacementIndex)
      const after = lineRef.current.slice(
        state.replacementIndex + state.replacementLength
      )
      lineRef.current = before + text + after
      state.replacementLength = text.length
      refreshCurrentLine()
    },
    [refreshCurrentLine]
  )

  const handleComplete = useCallback(
    (msg: CompleteMessage) => {
      const term = termRef.current
      if (!term) return

      const matches = msg.matches ?? []
      const replacementIndex = msg.replacementIndex ?? 0
      const replacementLength = msg.replacementLength ?? 0
      const state = completionRef.current

      state.replacementIndex = replacementIndex
      state.replacementLength = replacementLength
      state.matches = matches

      if (matches.length === 0) {
        term.write('\x07')
        resetCompletion()
        return
      }

      const currentToken = lineRef.current.slice(
        replacementIndex,
        replacementIndex + replacementLength
      )

      if (state.pressCount === 1) {
        if (matches.length === 1) {
          applyCompletion(matches[0]!)
          resetCompletion()
          return
        }

        const prefix = longestCommonPrefix(matches)
        if (prefix.length > currentToken.length) {
          applyCompletion(prefix)
          return
        }

        if (msg.currentMatch && msg.currentMatch.length > currentToken.length) {
          applyCompletion(msg.currentMatch)
          return
        }
      }

      if (state.pressCount === 2) {
        term.write(`\r\n\x1b[90m${matches.join('  ')}\x1b[0m\r\n`)
        term.write(`\x1b[33m${promptRef.current}\x1b[0m${lineRef.current}`)
        return
      }

      if (state.pressCount >= 3) {
        const cycleIndex = (state.pressCount - 3) % matches.length
        applyCompletion(matches[cycleIndex]!)
      }
    },
    [applyCompletion, resetCompletion]
  )

  const handleCompleteRef = useRef(handleComplete)
  handleCompleteRef.current = handleComplete

  const writePrompt = useCallback(() => {
    termRef.current?.write(`\r\n\x1b[33m${promptRef.current}\x1b[0m`)
    resetCompletion()
  }, [resetCompletion])

  const disconnect = useCallback(() => {
    connectionGenRef.current += 1
    const ws = wsRef.current
    wsRef.current = null
    connectedPcIdRef.current = null
    lineRef.current = ''
    if (ws) {
      ws.onopen = null
      ws.onmessage = null
      ws.onerror = null
      ws.onclose = null
      ws.close()
    }
    resetCompletion()
  }, [resetCompletion])

  const requestComplete = useCallback(() => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    const state = completionRef.current
    if (!state.active) {
      state.active = true
      state.pressCount = 0
    }
    state.pressCount += 1

    ws.send(
      JSON.stringify({
        type: 'complete',
        line: lineRef.current,
        cursor: lineRef.current.length,
      })
    )
  }, [])

  const connect = useCallback(
    (target: ManagedPc) => {
      disconnect()
      const term = termRef.current
      if (!term) return

      const connectionGen = connectionGenRef.current
      lineRef.current = ''

      term.clear()
      term.writeln(`\x1b[90m${target.name} (${target.address}) — baglaniyor...\x1b[0m`)

      const ws = new WebSocket(`${WS_BASE}?pcId=${encodeURIComponent(target.id)}`)
      wsRef.current = ws
      connectedPcIdRef.current = target.id

      ws.onopen = () => {
        if (connectionGenRef.current !== connectionGen) return
        term.writeln('\x1b[90mKimlik dogrulaniyor...\x1b[0m')
      }

      ws.onmessage = event => {
        if (connectionGenRef.current !== connectionGen) return
        let msg: Record<string, unknown>
        try {
          msg = JSON.parse(event.data as string) as Record<string, unknown>
        } catch {
          return
        }

        const type = String(msg.type ?? '')

        if (type === 'ready') {
          term.clear()
          if (typeof msg.banner === 'string' && msg.banner) {
            term.writeln(msg.banner)
          }
          term.writeln(
            `\x1b[90m${String(msg.pcName ?? target.name)} (${String(msg.address ?? target.address)})\x1b[0m`
          )
          promptRef.current =
            typeof msg.prompt === 'string' ? msg.prompt : 'PS> '
          writePrompt()
          return
        }

        if (type === 'complete') {
          handleCompleteRef.current({
            type: 'complete',
            replacementIndex: Number(msg.replacementIndex ?? 0),
            replacementLength: Number(msg.replacementLength ?? 0),
            currentMatch:
              typeof msg.currentMatch === 'string' ? msg.currentMatch : '',
            matches: Array.isArray(msg.matches)
              ? msg.matches.map(String)
              : [],
          })
          return
        }

        if (type === 'output' && typeof msg.data === 'string' && msg.data) {
          term.writeln(msg.data)
          resetCompletion()
          return
        }

        if (type === 'error' && typeof msg.data === 'string' && msg.data) {
          term.writeln(`\x1b[31m${msg.data}\x1b[0m`)
          resetCompletion()
          return
        }

        if (type === 'prompt' && typeof msg.data === 'string' && msg.data) {
          promptRef.current = msg.data
          writePrompt()
        }
      }

      ws.onerror = () => {
        if (connectionGenRef.current !== connectionGen) return
        term.writeln('\x1b[31mWebSocket baglantisi basarisiz.\x1b[0m')
      }

      ws.onclose = () => {
        if (connectionGenRef.current !== connectionGen) return
        if (connectedPcIdRef.current === target.id) {
          connectedPcIdRef.current = null
        }
        term.writeln('\x1b[90mBaglanti kapandi.\x1b[0m')
      }
    },
    [disconnect, writePrompt, resetCompletion]
  )

  const connectRef = useRef(connect)
  connectRef.current = connect

  const requestCompleteRef = useRef(requestComplete)
  requestCompleteRef.current = requestComplete

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Consolas, "Courier New", monospace',
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#e6edf3',
        selectionBackground: '#264f78',
      },
      scrollback: 5000,
      convertEol: true,
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()

    termRef.current = term
    fitRef.current = fit

    const observer = new ResizeObserver(() => {
      fit.fit()
    })
    observer.observe(containerRef.current)

    term.writeln('\x1b[90mUzak terminal hazir. Bir PC secin.\x1b[0m')
    term.writeln('\x1b[90mTab: otomatik tamamlama (tekrar Tab: liste / dongu)\x1b[0m')

    term.onData(data => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) return

      if (data === '\t') {
        requestCompleteRef.current()
        return
      }

      if (data === '\r') {
        const line = lineRef.current
        lineRef.current = ''
        resetCompletion()
        term.write('\r\n')

        if (line.trim().toLowerCase() === 'cls' || line.trim().toLowerCase() === 'clear') {
          term.clear()
          writePrompt()
          return
        }

        ws.send(JSON.stringify({ type: 'command', line }))
        return
      }

      if (data === '\u007f') {
        resetCompletion()
        if (lineRef.current.length > 0) {
          lineRef.current = lineRef.current.slice(0, -1)
          term.write('\b \b')
        }
        return
      }

      if (data === '\u0003') {
        term.writeln('^C')
        lineRef.current = ''
        resetCompletion()
        writePrompt()
        return
      }

      if (data >= ' ') {
        resetCompletion()
        lineRef.current += data
        term.write(data)
      }
    })

    return () => {
      observer.disconnect()
      disconnect()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [disconnect, writePrompt, resetCompletion])

  useEffect(() => {
    if (!pc || !credentialsReady) {
      disconnect()
      if (!pc && termRef.current) {
        termRef.current.clear()
        termRef.current.writeln('\x1b[90mUzak terminal hazir. Bir PC secin.\x1b[0m')
        termRef.current.writeln('\x1b[90mTab: otomatik tamamlama (tekrar Tab: liste / dongu)\x1b[0m')
      }
      return
    }

    connectRef.current(pc)
  }, [pc?.id, credentialsReady, disconnect])

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border bg-[#0d1117] p-2',
        className
      )}
    >
      <div ref={containerRef} className="h-full min-h-[320px] w-full" />
    </div>
  )
}
