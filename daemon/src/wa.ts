import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import QRCode from 'qrcode'
import {
  makeWASocket,
  makeInMemoryStore,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  type WASocket,
} from '@whiskeysockets/baileys'

const logger = {
  level: 'info',
  child: () => logger,
  trace: console.trace,
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
}

export type WaState = 'offline' | 'linking' | 'online' | 'needs_relink'

export interface WaStatus {
  state: WaState
  linked: boolean
  jid: string | null
  chatCount: number
  version: string
}

export interface WaClientOptions {
  authDir: string
  onQr: (qr: string, pngPath: string) => void
}

export class WaClient {
  private sock: WASocket | null = null
  private state: WaState = 'offline'
  private jid: string | null = null
  private chatJids = new Set<string>()
  private qrTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private starting = false
  private startPromise: Promise<void> | null = null
  private storeRef = makeInMemoryStore({ logger })
  private opts: WaClientOptions
  private qrFile: string

  constructor(opts: WaClientOptions) {
    this.opts = opts
    this.qrFile = join(opts.authDir, 'qr.png')
    mkdirSync(opts.authDir, { recursive: true })
  }

  status(): WaStatus {
    return {
      state: this.state,
      linked: this.jid !== null,
      jid: this.jid,
      chatCount: this.chatJids.size,
      version: '0.1.0',
    }
  }

  get socket(): WASocket | null {
    return this.sock
  }

  get store() {
    return this.storeRef
  }

  qrPath(): string {
    return this.qrFile
  }

  start(): Promise<void> {
    if (
      this.starting ||
      (this.state !== 'offline' && this.state !== 'needs_relink')
    )
      return Promise.resolve()
    this.starting = true
    const p = this.doStart().finally(() => {
      this.starting = false
      if (this.startPromise === p) this.startPromise = null
    })
    this.startPromise = p
    return p
  }

  private async doStart(): Promise<void> {
    const { state: authState, saveCreds } = await useMultiFileAuthState(
      this.opts.authDir,
    )
    const { version } = await fetchLatestBaileysVersion()
    this.state = authState.creds.registered ? 'online' : 'linking'

    const sock = makeWASocket({
      version,
      auth: {
        creds: authState.creds,
        keys: makeCacheableSignalKeyStore(authState.keys, logger),
      },
      printQRInTerminal: false,
      logger,
    })
    this.sock = sock
    this.storeRef.bind(sock.ev)

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('messaging-history.set', ({ chats }) => {
      this.chatJids = new Set(chats.map((c) => c.id))
    })
    sock.ev.on('chats.upsert', (chats) => {
      for (const c of chats) this.chatJids.add(c.id)
    })
    sock.ev.on('chats.delete', (jids) => {
      for (const jid of jids) this.chatJids.delete(jid)
    })

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update
      if (qr) {
        this.state = 'linking'
        QRCode.toFile(this.qrFile, qr).catch(console.error)
        this.opts.onQr(qr, this.qrFile)
        this.resetQrTimer()
      }
      if (connection === 'open') {
        this.state = 'online'
        this.jid = sock.user?.id ?? null
        if (this.qrTimer) clearTimeout(this.qrTimer)
      }
      if (connection === 'close') {
        const code = (
          lastDisconnect?.error as
            | (Error & { output?: { statusCode?: number } })
            | undefined
        )?.output?.statusCode
        if (code !== DisconnectReason.loggedOut) {
          this.state = 'offline'
          this.scheduleReconnect()
        } else {
          this.state = 'needs_relink'
          this.jid = null
        }
      }
    })
  }

  async stop(): Promise<void> {
    // If a start() is in flight (between its awaits, before this.sock is
    // assigned), wait for it to finish so we tear down the socket it creates
    // instead of returning a no-op and leaving a zombie connection.
    if (this.startPromise) await this.startPromise
    const sock = this.sock
    if (sock) {
      sock.end(undefined)
      // end() removes all 'error' listeners, then ws.close() makes the ws
      // lib emit "closed before the connection was established" on the next
      // tick (when still CONNECTING). Re-attach a no-op so that emission is
      // handled instead of crashing the process with an unhandled 'error'.
      sock.ws.on('error', () => {})
    }
    this.clearTimers()
    this.sock = null
    this.state = 'offline'
    this.jid = null
    this.chatJids.clear()
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.start().catch(console.error)
    }, 2000)
  }

  private resetQrTimer(): void {
    if (this.qrTimer) clearTimeout(this.qrTimer)
    this.qrTimer = setTimeout(() => {
      this.qrTimer = null
      this.sock?.end(undefined)
      this.start().catch(console.error)
    }, 60_000)
  }

  private clearTimers(): void {
    if (this.qrTimer) clearTimeout(this.qrTimer)
    this.qrTimer = null
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }
}
