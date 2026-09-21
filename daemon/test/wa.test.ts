import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { WaClient, type WaStatus } from '../src/wa.js'

test('WaClient inicia offline y expone status', () => {
  const c = new WaClient({ authDir: '/tmp/waat-test-auth', onQr: () => {} })
  const s: WaStatus = c.status()
  assert.equal(s.state, 'offline')
  assert.equal(s.linked, false)
})

test('WaClient expone qrPath dentro de authDir', () => {
  const c = new WaClient({ authDir: '/tmp/waat-test-auth3', onQr: () => {} })
  assert.ok(c.qrPath().endsWith('qr.png'))
})

test('stop() en cliente offline es no-op', async () => {
  const c = new WaClient({ authDir: '/tmp/waat-test-auth-stop', onQr: () => {} })
  await c.stop()
  assert.equal(c.status().state, 'offline')
})

test('socket getter es null antes de start()', () => {
  const c = new WaClient({ authDir: '/tmp/waat-test-auth-sock', onQr: () => {} })
  assert.equal(c.socket, null)
})

test('status() expone chatCount 0 y jid null', () => {
  const c = new WaClient({ authDir: '/tmp/waat-test-auth-status', onQr: () => {} })
  const s = c.status()
  assert.equal(s.chatCount, 0)
  assert.equal(s.jid, null)
})

test('constructor crea authDir', () => {
  const dir = '/tmp/waat-test-auth-mkdir'
  new WaClient({ authDir: dir, onQr: () => {} })
  assert.ok(existsSync(dir))
})

test('qrPath() es exactamente join(authDir, "qr.png")', () => {
  const dir = '/tmp/waat-test-auth-qrpath'
  const c = new WaClient({ authDir: dir, onQr: () => {} })
  assert.equal(c.qrPath(), join(dir, 'qr.png'))
})
