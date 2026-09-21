import { createServer as httpCreate, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { WaClient } from './wa.js'
import { listChats, readChat, searchMessages } from './chats.js'
import { downloadMedia, defaultTranscriber, type DownloadResult } from './media.js'
import { sendText, sendMedia } from './send.js'

export interface DaemonDeps {
  wa: WaClient
  port?: number
  host?: string
  token?: string
  exportDir?: string
  whisperModel?: string
  whisperLang?: string
}

export interface DaemonHandle {
  server: Server
  url: string
  token: string
}

function json(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

class BodyTooLargeError extends Error {}
class InvalidJsonError extends Error {}

const MAX_BODY_BYTES = 1024 * 1024 // 1 MB

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    const buf = c as Buffer
    size += buf.length
    if (size > MAX_BODY_BYTES) throw new BodyTooLargeError('body demasiado grande')
    chunks.push(buf)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  try {
    return JSON.parse(raw || '{}')
  } catch {
    throw new InvalidJsonError('JSON inválido')
  }
}

export function createServer(deps: DaemonDeps): Promise<DaemonHandle> {
  const token = deps.token ?? randomBytes(16).toString('hex')
  const host = deps.host ?? '127.0.0.1'
  const port = deps.port ?? 8787
  // Dedupe de descargas en vuelo por messageKey: peticiones concurrentes al mismo
  // mensaje comparten la misma promesa y no pisan el archivo ni relanzan whisper.
  const inFlight = new Map<string, Promise<DownloadResult>>()

  const server = httpCreate(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${host}`)
    const path = url.pathname
    const provided = req.headers['x-waat-token']
    const authed =
      typeof provided === 'string' &&
      provided.length === token.length &&
      timingSafeEqual(Buffer.from(provided), Buffer.from(token))

    try {
      if (path === '/health' && req.method === 'GET') {
        return json(res, 200, { ok: true })
      }
      if (!authed) return json(res, 401, { ok: false, error: 'unauthorized' })

      if (path === '/status' && req.method === 'GET') {
        return json(res, 200, { ok: true, data: deps.wa.status() })
      }

      if (path === '/link' && req.method === 'POST') {
        const s = deps.wa.status()
        if (s.state === 'online') {
          return json(res, 409, { ok: false, error: 'already_online' })
        }
        await deps.wa.start()
        return json(res, 200, { ok: true, data: { state: 'linking', qr: deps.wa.qrPath() } })
      }

      if (path === '/chats' && req.method === 'GET') {
        if (!deps.wa.socket) return json(res, 503, { ok: false, error: 'offline' })
        const q = url.searchParams.get('q')?.toLowerCase()
        let chats = listChats(deps.wa.store)
        if (q) chats = chats.filter((c) => c.name.toLowerCase().includes(q))
        return json(res, 200, { ok: true, data: chats })
      }

      const chatMatch = path.match(/^\/chats\/([^/]+)\/messages$/)
      if (chatMatch && req.method === 'GET') {
        if (!deps.wa.socket) return json(res, 503, { ok: false, error: 'offline' })
        const chatId = decodeURIComponent(chatMatch[1])
        const data = await readChat(deps.wa.store, chatId, {
          limit: Number(url.searchParams.get('limit') ?? 50),
          before: url.searchParams.get('before') ?? undefined,
        })
        return json(res, 200, { ok: true, data })
      }

      if (path === '/search' && req.method === 'GET') {
        if (!deps.wa.socket) return json(res, 503, { ok: false, error: 'offline' })
        const q = url.searchParams.get('q') ?? ''
        const chat = url.searchParams.get('chat') ?? undefined
        const data = await searchMessages(deps.wa.store, q, chat)
        return json(res, 200, { ok: true, data })
      }

      if (path === '/media/download' && req.method === 'POST') {
        if (!deps.wa.socket) return json(res, 503, { ok: false, error: 'offline' })
        let body: unknown
        try {
          body = await readBody(req)
        } catch (err) {
          if (err instanceof BodyTooLargeError) return json(res, 413, { ok: false, error: 'body_too_large' })
          if (err instanceof InvalidJsonError) return json(res, 400, { ok: false, error: 'invalid_json' })
          throw err
        }
        const chatId = (body as { chatId?: unknown })?.chatId
        const messageKey = (body as { messageKey?: unknown })?.messageKey
        if (
          typeof chatId !== 'string' || chatId.length === 0 ||
          typeof messageKey !== 'string' || messageKey.length === 0
        ) {
          return json(res, 400, { ok: false, error: 'invalid_body' })
        }
        const chat = deps.wa.store.chats.all().find((c) => c.id === chatId)
        const exportDir = deps.exportDir ?? join(homedir(), 'waat')
        const transcriber = defaultTranscriber(
          deps.whisperModel ?? 'small',
          deps.whisperLang ?? 'Spanish'
        )
        const key = `${chatId}/${messageKey}`
        let p = inFlight.get(key)
        if (!p) {
          p = downloadMedia(deps.wa.store, chatId, chat?.name ?? chatId, messageKey, exportDir, transcriber)
          inFlight.set(key, p)
          // Limpia la entrada al asentarse (éxito o error). .then(f, r) en vez de
          // .finally() para que la promesa derivada no rechace sin manejarse.
          void p.then(
            () => inFlight.delete(key),
            () => inFlight.delete(key),
          )
        }
        const data = await p
        return json(res, 200, { ok: true, data })
      }

      if (path === '/send/text' && req.method === 'POST') {
        const sock = deps.wa.socket
        if (!sock) return json(res, 503, { ok: false, error: 'offline' })
        const body = (await readBody(req)) as { chatId: string; text: string }
        if (!body.chatId || !body.text) {
          return json(res, 400, { ok: false, error: 'chatId y text son requeridos' })
        }
        const key = await sendText(sock, body.chatId, body.text)
        return json(res, 200, { ok: true, data: { key: key.id } })
      }

      if (path === '/send/media' && req.method === 'POST') {
        const sock = deps.wa.socket
        if (!sock) return json(res, 503, { ok: false, error: 'offline' })
        const body = (await readBody(req)) as {
          chatId: string
          filePath: string
          caption?: string
          ptt?: boolean
        }
        if (!body.chatId || !body.filePath) {
          return json(res, 400, { ok: false, error: 'chatId y filePath son requeridos' })
        }
        const data = await sendMedia(sock, body.chatId, body.filePath, {
          caption: body.caption,
          ptt: body.ptt,
        })
        return json(res, 200, { ok: true, data: { key: data.key.id, type: data.type } })
      }

      return json(res, 404, { ok: false, error: 'not_found' })
    } catch (err) {
      return json(res, 500, { ok: false, error: String(err) })
    }
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.removeListener('error', reject)
      const addr = server.address()
      const actualPort = typeof addr === 'object' && addr ? addr.port : port
      resolve({ server, url: `http://${host}:${actualPort}`, token })
    })
  })
}
