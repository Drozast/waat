import { test } from 'node:test'
import assert from 'node:assert/strict'
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
