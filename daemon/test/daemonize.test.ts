import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
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
  releaseLock(lockPath)
  const c = acquireLock(lockPath)
  assert.ok(c)
  c!()
})

test('acquireLock toma un lock stale (PID muerto)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'waat-lock-'))
  const lockPath = join(dir, 'daemon.lock')
  writeFileSync(lockPath, '99999999')
  const a = acquireLock(lockPath)
  assert.ok(a)
  a!()
})

test('renderLaunchdPlist genera el plist completo y bien formado', () => {
  const out = renderLaunchdPlist({
    label: 'com.drozast.waat',
    program: '/usr/local/bin/node',
    args: ['/opt/waat/daemon/dist/index.js'],
    stdout: '/tmp/waat-out.log',
    stderr: '/tmp/waat-err.log',
  })
  const expected = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.drozast.waat</string>
  <key>ProgramArguments</key>
  <array>
      <string>/usr/local/bin/node</string>
      <string>/opt/waat/daemon/dist/index.js</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/waat-out.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/waat-err.log</string>
</dict>
</plist>
`
  assert.equal(out, expected)
})

test('renderLaunchdPlist escapa XML en los valores', () => {
  const out = renderLaunchdPlist({
    label: 'com.drozast.waat',
    program: '/usr/local/bin/node',
    args: ['/opt/waat/daemon/dist/index.js'],
    stdout: '/Users/R&D/logs/waat <out>.log',
    stderr: '/tmp/waat-err.log',
  })
  assert.ok(out.includes('<string>/Users/R&amp;D/logs/waat &lt;out&gt;.log</string>'))
  assert.ok(!out.includes('R&D'))
})
