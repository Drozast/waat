import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { acquireLock, releaseLock, renderLaunchdPlist } from '../src/daemonize.js'

test('acquireLock toma el lock y releaseLock lo libera', () => {
  const dir = mkdtempSync(join(tmpdir(), 'waat-lock-'))
  const lockPath = join(dir, 'daemon.lock')
  const a = acquireLock(lockPath)
  assert.ok(a)
  const b = acquireLock(lockPath)
  assert.equal(b, null)
  a!()
  const c = acquireLock(lockPath)
  assert.ok(c)
  c!()
})

test('renderLaunchdPlist genera plist válido con paths', () => {
  const out = renderLaunchdPlist({
    label: 'com.drozast.waat',
    program: '/usr/local/bin/node',
    args: ['/opt/waat/daemon/dist/index.js'],
    stdout: '/tmp/waat-out.log',
    stderr: '/tmp/waat-err.log',
  })
  assert.ok(out.includes('<key>Label</key>'))
  assert.ok(out.includes('com.drozast.waat'))
  assert.ok(out.includes('<key>RunAtLoad</key>'))
  assert.ok(out.includes('<true/>'))
})
