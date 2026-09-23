import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { ensureDaemon } from '../src/daemon.js'

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      s.close(() => resolve(port))
    })
  })
}

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'waat-mcp-daemon-'))
}

test('ensureDaemon: daemon ya arriba → true sin spawn', async () => {
  const port = await freePort()
  const srv = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"ok":true}')
    } else {
      res.writeHead(404)
      res.end('{}')
    }
  })
  await new Promise<void>((r) => srv.listen(port, '127.0.0.1', () => r()))
  const dir = tmpDir()
  // daemonJs inexistente: si no spawnearía, no debería importarnos
  const ok = await ensureDaemon({ waatDir: dir, port, daemonJs: join(dir, 'no-existe.js'), timeoutMs: 2000 })
  assert.equal(ok, true)
  srv.close()
  rmSync(dir, { recursive: true, force: true })
})

test('ensureDaemon: daemon abajo y daemonJs inexistente → false', async () => {
  const port = await freePort()
  const dir = tmpDir()
  const ok = await ensureDaemon({ waatDir: dir, port, daemonJs: join(dir, 'no-existe.js'), timeoutMs: 2000 })
  assert.equal(ok, false)
  rmSync(dir, { recursive: true, force: true })
})

test('ensureDaemon: daemon abajo → spawnea y espera /health', async () => {
  const port = await freePort()
  const dir = tmpDir()
  // "daemon" falso: lee WAAT_PORT y levanta un server que responde /health
  const fakeDaemon = join(dir, 'fake-daemon.js')
  writeFileSync(
    fakeDaemon,
    `
    import { createServer } from 'node:http'
    const port = Number(process.env.WAAT_PORT)
    createServer((req, res) => {
      if (req.url === '/health') { res.writeHead(200); res.end('{"ok":true}') }
      else { res.writeHead(404); res.end('{}') }
    }).listen(port, '127.0.0.1')
    `
  )
  const ok = await ensureDaemon({ waatDir: dir, port, daemonJs: fakeDaemon, timeoutMs: 10000 })
  assert.equal(ok, true)
  // el lock quedó escrito con el pid del hijo
  const lock = join(dir, 'daemon.lock')
  assert.ok(existsSync(lock), 'debería existir el lock')
  const pid = Number(readFileSync(lock, 'utf8').trim())
  assert.ok(pid > 0)
  // limpieza: matamos al fake daemon
  process.kill(pid, 'SIGTERM')
  rmSync(dir, { recursive: true, force: true })
})

test('ensureDaemon: lock stale (pid muerto) se limpia antes de spawn', async () => {
  const port = await freePort()
  const dir = tmpDir()
  const fakeDaemon = join(dir, 'fake-daemon.js')
  writeFileSync(
    fakeDaemon,
    `
    import { createServer } from 'node:http'
    const port = Number(process.env.WAAT_PORT)
    createServer((req, res) => {
      if (req.url === '/health') { res.writeHead(200); res.end('{"ok":true}') }
      else { res.writeHead(404); res.end('{}') }
    }).listen(port, '127.0.0.1')
    `
  )
  // lock con un PID que casi seguro no existe
  const lock = join(dir, 'daemon.lock')
  writeFileSync(lock, '999999')
  const ok = await ensureDaemon({ waatDir: dir, port, daemonJs: fakeDaemon, timeoutMs: 10000 })
  assert.equal(ok, true)
  const pid = Number(readFileSync(lock, 'utf8').trim())
  assert.ok(pid > 0 && pid !== 999999, 'el lock debe tener el pid del nuevo daemon')
  process.kill(pid, 'SIGTERM')
  rmSync(dir, { recursive: true, force: true })
})
