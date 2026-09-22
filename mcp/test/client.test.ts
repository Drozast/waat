import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { WaatClient } from '../src/client.js'

interface Captured {
  method: string
  url: string
  body: unknown
}

let server: ReturnType<typeof createServer>
let base: string
let client: WaatClient
let last: Captured = { method: '', url: '', body: undefined }

before(async () => {
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      last = {
        method: req.method ?? '',
        url: req.url ?? '',
        body: raw ? JSON.parse(raw) : undefined,
      }
      const send = (status: number, payload: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(payload))
      }
      if (req.url === '/health') return send(200, { ok: true })
      if (req.url === '/status') return send(200, { ok: true, data: { state: 'online' } })
      if (req.url === '/link') return send(200, { ok: true, data: { qr: '/tmp/qr.png' } })
      if (req.url?.startsWith('/chats')) return send(200, { ok: true, data: { chats: [] } })
      if (req.url?.startsWith('/search')) return send(200, { ok: true, data: { results: [] } })
      if (req.url === '/media/download') return send(200, { ok: true, data: { path: '/tmp/media' } })
      if (req.url === '/send/text') return send(200, { ok: true, data: { id: 'm1' } })
      if (req.url === '/send/media') return send(200, { ok: true, data: { id: 'm2' } })
      if (req.url === '/503') return send(503, { ok: false, error: 'daemon_down' })
      return send(404, { ok: false, error: 'not_found' })
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  const addr = server.address()
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
  client = new WaatClient({ baseUrl: base, token: 'test-token' })
})

after(() => server.close())

test('WaatClient.health responde', async () => {
  const h = await client.health()
  assert.equal(h.ok, true)
})

test('WaatClient.status parsea data', async () => {
  const s = await client.status()
  assert.equal(s.data.state, 'online')
})

test('WaatClient devuelve error estructurado ante 404', async () => {
  const r = await client.request('GET', '/no-existe')
  assert.equal(r.ok, false)
  assert.equal(r.error, 'not_found')
})

test('link() hace POST /link', async () => {
  const r = await client.link()
  assert.equal(r.ok, true)
  assert.equal(last.method, 'POST')
  assert.equal(last.url, '/link')
})

test('downloadMedia() hace POST /media/download con body', async () => {
  const r = await client.downloadMedia('123@c.us', 'key-1')
  assert.equal(r.ok, true)
  assert.equal(last.method, 'POST')
  assert.equal(last.url, '/media/download')
  assert.deepEqual(last.body, { chatId: '123@c.us', messageKey: 'key-1' })
})

test('sendText() hace POST /send/text con body', async () => {
  const r = await client.sendText('123@c.us', 'hola')
  assert.equal(r.ok, true)
  assert.equal(last.method, 'POST')
  assert.equal(last.url, '/send/text')
  assert.deepEqual(last.body, { chatId: '123@c.us', text: 'hola' })
})

test('sendMedia() hace POST /send/media con body', async () => {
  const r = await client.sendMedia('123@c.us', '/tmp/foto.png', 'caption', true)
  assert.equal(r.ok, true)
  assert.equal(last.method, 'POST')
  assert.equal(last.url, '/send/media')
  assert.deepEqual(last.body, { chatId: '123@c.us', filePath: '/tmp/foto.png', caption: 'caption', ptt: true })
})

test('listChats(q) codifica la query', async () => {
  const r = await client.listChats('café & más')
  assert.equal(r.ok, true)
  assert.equal(last.method, 'GET')
  assert.equal(last.url, `/chats?q=${encodeURIComponent('café & más')}`)
})

test('listChats() sin q va a /chats', async () => {
  const r = await client.listChats()
  assert.equal(r.ok, true)
  assert.equal(last.url, '/chats')
})

test('readChat() codifica chatId en la path y los query params', async () => {
  const r = await client.readChat('123 456@c.us', 10, 'prev-key')
  assert.equal(r.ok, true)
  assert.equal(last.method, 'GET')
  assert.equal(last.url, `/chats/${encodeURIComponent('123 456@c.us')}/messages?limit=10&before=prev-key`)
})

test('readChat() sin limit/before no agrega query', async () => {
  const r = await client.readChat('123@c.us')
  assert.equal(r.ok, true)
  assert.equal(last.url, '/chats/123%40c.us/messages')
})

test('search(q, chatId) codifica la query', async () => {
  const r = await client.search('hola & adios', '123@c.us')
  assert.equal(r.ok, true)
  assert.equal(last.method, 'GET')
  assert.equal(last.url, '/search?q=hola+%26+adios&chat=123%40c.us')
})

test('search(q) sin chatId omite el parámetro chat', async () => {
  const r = await client.search('solo')
  assert.equal(r.ok, true)
  assert.equal(last.url, '/search?q=solo')
})

test('error de red devuelve offline (GET)', async () => {
  const s = createServer()
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()))
  const addr = s.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  s.close()
  const offline = new WaatClient({ baseUrl: `http://127.0.0.1:${port}`, token: 't' })
  const r = await offline.status()
  assert.equal(r.ok, false)
  assert.equal(r.error, 'offline')
})

test('error de red devuelve offline (POST)', async () => {
  const s = createServer()
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()))
  const addr = s.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  s.close()
  const offline = new WaatClient({ baseUrl: `http://127.0.0.1:${port}`, token: 't' })
  const r = await offline.sendText('123@c.us', 'hola')
  assert.equal(r.ok, false)
  assert.equal(r.error, 'offline')
})

test('503 devuelve offline', async () => {
  const r = await client.request('GET', '/503')
  assert.equal(r.ok, false)
  assert.equal(r.error, 'offline')
})
