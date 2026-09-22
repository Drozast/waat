import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { WaatClient } from '../src/client.js'

let server: ReturnType<typeof createServer>
let base: string
let client: WaatClient

before(async () => {
  server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    } else if (req.url === '/status') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, data: { state: 'online' } }))
    } else {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'not_found' }))
    }
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
