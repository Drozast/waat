import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import QRCode from 'qrcode'
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  type WASocket,
} from '@whiskeysockets/baileys'
import type { Boom } from '@hapi/boom'

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

  qrPath(): string {
    return this.qrFile
  }

  async start(): Promise<void> {
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
        const code = (lastDisconnect?.error as Boom)?.output?.statusCode
        if (code !== DisconnectReason.loggedOut) {
          this.state = 'linking'
          setTimeout(() => this.start().catch(console.error), 2000)
        } else {
          this.state = 'needs_relink'
          this.jid = null
        }
      }
    })
  }

  async stop(): Promise<void> {
    this.sock?.end(undefined)
    this.sock = null
    this.state = 'offline'
  }

  private resetQrTimer(): void {
    if (this.qrTimer) clearTimeout(this.qrTimer)
    this.qrTimer = setTimeout(() => {
      this.sock?.end(undefined)
      this.start().catch(console.error)
    }, 60_000)
  }
}
