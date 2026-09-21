import { createServer as httpCreate, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { WaClient } from './wa.js'
import { listChats, readChat, searchMessages } from './chats.js'

export interface DaemonDeps {
  wa: WaClient
  port?: number
  host?: string
  token?: string
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

export function createServer(deps: DaemonDeps): Promise<DaemonHandle> {
  const token = deps.token ?? randomBytes(16).toString('hex')
  const host = deps.host ?? '127.0.0.1'
  const port = deps.port ?? 8787

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
