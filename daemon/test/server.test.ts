import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { createServer, type DaemonHandle } from '../src/server.js'
import { WaClient } from '../src/wa.js'

let handle: DaemonHandle
let base: string
let wa: WaClient

before(async () => {
  wa = new WaClient({ authDir: '/tmp/waat-test-server', onQr: () => {} })
  handle = await createServer({ wa, port: 0 })
  base = handle.url
})

after(async () => {
  await wa.stop()
  handle.server.close()
})

test('GET /health responde ok sin token', async () => {
  const res = await fetch(`${base}/health`)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.ok, true)
})

test('GET /status con token refleja estado del WaClient', async () => {
  const res = await fetch(`${base}/status`, { headers: { 'x-waat-token': handle.token } })
  const body = await res.json()
  assert.equal(body.ok, true)
  assert.ok(['offline', 'linking', 'online', 'needs_relink'].includes(body.data.state))
})

test('GET /status sin token responde 401', async () => {
  const res = await fetch(`${base}/status`)
  assert.equal(res.status, 401)
})

test('POST /link offline responde 200 y estado linking', async () => {
  const res = await fetch(`${base}/link`, {
    method: 'POST',
    headers: { 'x-waat-token': handle.token },
  })
  const body = await res.json()
  assert.equal(res.status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.data.state, 'linking')
  assert.ok(body.data.qr.endsWith('qr.png'))
})
