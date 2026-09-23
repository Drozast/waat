import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type DaemonHandle } from '../src/server.js'
import { WaClient } from '../src/wa.js'
import { setMediaDownloader } from '../src/media.js'

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
  // close() no cierra conexiones keep-alive ya abiertas (fetch); sin esto el
  // proceso se queda vivo con handles pendientes.
  handle.server.closeAllConnections()
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

test('createServer rechaza con EADDRINUSE si el puerto está ocupado', async () => {
  const addr = handle.server.address()
  assert.ok(addr && typeof addr === 'object')
  await assert.rejects(
    createServer({ wa, port: addr.port }),
    (err: NodeJS.ErrnoException) => err.code === 'EADDRINUSE',
  )
})

// --- POST /media/download ---

async function postMedia(body: string, contentType = 'application/json') {
  return fetch(`${base}/media/download`, {
    method: 'POST',
    headers: { 'x-waat-token': handle.token, 'content-type': contentType },
    body,
  })
}

test('POST /media/download offline responde 503', async () => {
  const prev = (wa as any).sock
  ;(wa as any).sock = null
  try {
    const res = await postMedia(JSON.stringify({ chatId: 'c@s.whatsapp.net', messageKey: 'm1' }))
    assert.equal(res.status, 503)
    const body = await res.json()
    assert.equal(body.error, 'offline')
  } finally {
    ;(wa as any).sock = prev
  }
})

test('POST /media/download con chatId vacío responde 400 invalid_body', async () => {
  const prev = (wa as any).sock
  ;(wa as any).sock = {}
  try {
    const res = await postMedia(JSON.stringify({ chatId: '', messageKey: 'm1' }))
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.error, 'invalid_body')
  } finally {
    ;(wa as any).sock = prev
  }
})

test('POST /media/download con messageKey no-string responde 400 invalid_body', async () => {
  const prev = (wa as any).sock
  ;(wa as any).sock = {}
  try {
    const res = await postMedia(JSON.stringify({ chatId: 'c@s.whatsapp.net', messageKey: 123 }))
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.error, 'invalid_body')
  } finally {
    ;(wa as any).sock = prev
  }
})

test('POST /media/download con JSON malformado responde 400 invalid_json', async () => {
  const prev = (wa as any).sock
  ;(wa as any).sock = {}
  try {
    const res = await postMedia('{chatId: "c@s.whatsapp.net"')
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.error, 'invalid_json')
  } finally {
    ;(wa as any).sock = prev
  }
})

test('POST /media/download con body > 1MB responde 413 body_too_large', async () => {
  const prev = (wa as any).sock
  ;(wa as any).sock = {}
  try {
    const pad = 'x'.repeat(1024 * 1024 + 64)
    const res = await postMedia(JSON.stringify({ chatId: 'c@s.whatsapp.net', messageKey: 'm1', pad }))
    assert.equal(res.status, 413)
    const body = await res.json()
    assert.equal(body.error, 'body_too_large')
  } finally {
    ;(wa as any).sock = prev
  }
})

test('POST /media/download dedupe: dos peticiones concurrentes al mismo mensaje descargan una vez', async () => {
  const exportDir = mkdtempSync(join(tmpdir(), 'waat-dedupe-'))
  const wa2 = new WaClient({ authDir: join(exportDir, 'auth'), onQr: () => {} })
  const h2 = await createServer({ wa: wa2, port: 0, exportDir })
  const jid = 'c@s.whatsapp.net'
  const msg = { key: { id: 'm1' }, messageTimestamp: 1758000000, message: { imageMessage: {} } }
  ;(wa2.store as any).messages[jid] = { array: [msg] }
  ;(wa2 as any).sock = {}
  let calls = 0
  const restore = setMediaDownloader(async () => {
    calls++
    await new Promise((r) => setTimeout(r, 50))
    return Buffer.from('IMGDATA')
  })
  try {
    const post = (body: string) =>
      fetch(`${h2.url}/media/download`, {
        method: 'POST',
        headers: { 'x-waat-token': h2.token, 'content-type': 'application/json' },
        body,
      })
    const [r1, r2] = await Promise.all([
      post(JSON.stringify({ chatId: jid, messageKey: 'm1' })),
      post(JSON.stringify({ chatId: jid, messageKey: 'm1' })),
    ])
    assert.equal(r1.status, 200)
    assert.equal(r2.status, 200)
    const b1 = await r1.json()
    const b2 = await r2.json()
    assert.equal(b1.data.path, b2.data.path)
    assert.equal(calls, 1, `el downloader se invocó ${calls} veces, esperado 1`)
  } finally {
    setMediaDownloader(restore)
    ;(wa2 as any).sock = null
    await wa2.stop()
    h2.server.close()
    h2.server.closeAllConnections()
  }
})

// --- POST /send/text y /send/media ---

async function postSend(route: string, body: string, contentType = 'application/json') {
  return fetch(`${base}${route}`, {
    method: 'POST',
    headers: { 'x-waat-token': handle.token, 'content-type': contentType },
    body,
  })
}

test('POST /send/text offline responde 503', async () => {
  const prev = (wa as any).sock
  ;(wa as any).sock = null
  try {
    const res = await postSend('/send/text', JSON.stringify({ chatId: 'c@s.whatsapp.net', text: 'hola' }))
    assert.equal(res.status, 503)
    const body = await res.json()
    assert.equal(body.error, 'offline')
  } finally {
    ;(wa as any).sock = prev
  }
})

test('POST /send/text con campos ausentes responde 400', async () => {
  const prev = (wa as any).sock
  ;(wa as any).sock = {}
  try {
    const res = await postSend('/send/text', JSON.stringify({ chatId: 'c@s.whatsapp.net' }))
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.ok, false)
  } finally {
    ;(wa as any).sock = prev
  }
})

test('POST /send/text con JSON malformado responde 400 invalid_json', async () => {
  const prev = (wa as any).sock
  ;(wa as any).sock = {}
  try {
    const res = await postSend('/send/text', '{chatId: "c@s.whatsapp.net"')
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.error, 'invalid_json')
  } finally {
    ;(wa as any).sock = prev
  }
})

test('POST /send/text happy path responde 200 con key', async () => {
  const prev = (wa as any).sock
  ;(wa as any).sock = { sendMessage: async () => ({ key: { id: 'MSGID1' } }) }
  try {
    const res = await postSend('/send/text', JSON.stringify({ chatId: 'c@s.whatsapp.net', text: 'hola' }))
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.ok, true)
    assert.equal(body.data.key, 'MSGID1')
  } finally {
    ;(wa as any).sock = prev
  }
})

test('POST /send/media offline responde 503', async () => {
  const prev = (wa as any).sock
  ;(wa as any).sock = null
  try {
    const res = await postSend('/send/media', JSON.stringify({ chatId: 'c@s.whatsapp.net', filePath: '/tmp/x.jpg' }))
    assert.equal(res.status, 503)
    const body = await res.json()
    assert.equal(body.error, 'offline')
  } finally {
    ;(wa as any).sock = prev
  }
})

test('POST /send/media con campos ausentes responde 400', async () => {
  const prev = (wa as any).sock
  ;(wa as any).sock = {}
  try {
    const res = await postSend('/send/media', JSON.stringify({ chatId: 'c@s.whatsapp.net' }))
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.ok, false)
  } finally {
    ;(wa as any).sock = prev
  }
})

test('POST /send/media con JSON malformado responde 400 invalid_json', async () => {
  const prev = (wa as any).sock
  ;(wa as any).sock = {}
  try {
    const res = await postSend('/send/media', '{chatId: "c@s.whatsapp.net"')
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.error, 'invalid_json')
  } finally {
    ;(wa as any).sock = prev
  }
})

test('POST /send/media happy path responde 200 con key y type', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'waat-send-http-'))
  const file = join(dir, 'foto.png')
  writeFileSync(file, 'PNGDATA')
  const prev = (wa as any).sock
  ;(wa as any).sock = { sendMessage: async () => ({ key: { id: 'MSGID2' } }) }
  try {
    const res = await postSend(
      '/send/media',
      JSON.stringify({ chatId: 'c@s.whatsapp.net', filePath: file, caption: 'hola' }),
    )
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.ok, true)
    assert.equal(body.data.key, 'MSGID2')
    assert.equal(body.data.type, 'image')
  } finally {
    ;(wa as any).sock = prev
  }
})

test('POST /send/media con archivo inexistente responde 404 not_found', async () => {
  const prev = (wa as any).sock
  ;(wa as any).sock = { sendMessage: async () => ({ key: { id: 'MSGID3' } }) }
  try {
    const res = await postSend(
      '/send/media',
      JSON.stringify({ chatId: 'c@s.whatsapp.net', filePath: '/tmp/no-existe-waat.jpg' }),
    )
    assert.equal(res.status, 404)
    const body = await res.json()
    assert.equal(body.error, 'not_found')
  } finally {
    ;(wa as any).sock = prev
  }
})

test('POST /send/media con ruta relativa responde 400 not_absolute', async () => {
  const prev = (wa as any).sock
  ;(wa as any).sock = { sendMessage: async () => ({ key: { id: 'MSGID4' } }) }
  try {
    const res = await postSend(
      '/send/media',
      JSON.stringify({ chatId: 'c@s.whatsapp.net', filePath: 'foto.jpg' }),
    )
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.error, 'not_absolute')
  } finally {
    ;(wa as any).sock = prev
  }
})
