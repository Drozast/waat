import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, openSync, ftruncateSync, closeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mimeForFile, sendText, sendMedia, FileError, MAX_FILE_BYTES } from '../src/send.js'

test('mimeForFile resuelve tipos comunes', () => {
  assert.equal(mimeForFile('foto.jpg'), 'image/jpeg')
  assert.equal(mimeForFile('foto.png'), 'image/png')
  assert.equal(mimeForFile('nota.opus'), 'audio/ogg')
  assert.equal(mimeForFile('video.mp4'), 'video/mp4')
  assert.equal(mimeForFile('doc.pdf'), 'application/pdf')
  assert.equal(mimeForFile('archivo.xyz'), 'application/octet-stream')
})

function fakeSocket() {
  const calls: Array<{ chatId: string; payload: unknown }> = []
  const sock = {
    sendMessage: async (chatId: string, payload: unknown) => {
      calls.push({ chatId, payload })
      return { key: { id: 'MSGID123' } }
    },
  }
  return { sock, calls }
}

test('sendText envía { text } y devuelve el id del mensaje', async () => {
  const { sock, calls } = fakeSocket()
  const result = await sendText(sock as any, 'c@s.whatsapp.net', 'hola')
  assert.deepEqual(calls, [{ chatId: 'c@s.whatsapp.net', payload: { text: 'hola' } }])
  assert.deepEqual(result, { id: 'MSGID123' })
})

test('sendText lanza si sendMessage no devuelve mensaje', async () => {
  const sock = { sendMessage: async () => undefined }
  await assert.rejects(sendText(sock as any, 'c@s.whatsapp.net', 'hola'), /no devolvió mensaje/)
})

test('sendMedia envía imagen con caption', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'waat-send-'))
  const file = join(dir, 'foto.jpg')
  writeFileSync(file, 'IMGDATAS')
  const { sock, calls } = fakeSocket()
  const result = await sendMedia(sock as any, 'c@s.whatsapp.net', file, { caption: 'mi foto' })
  assert.equal(calls.length, 1)
  const payload = calls[0].payload as { image?: Buffer; caption?: string }
  assert.ok(payload.image instanceof Buffer)
  assert.equal(payload.image.toString(), 'IMGDATAS')
  assert.equal(payload.caption, 'mi foto')
  assert.deepEqual(result, { key: { id: 'MSGID123' }, type: 'image' })
})

test('sendMedia envía audio como ptt cuando se pide', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'waat-send-'))
  const file = join(dir, 'nota.opus')
  writeFileSync(file, 'AUDIODATA')
  const { sock, calls } = fakeSocket()
  const result = await sendMedia(sock as any, 'c@s.whatsapp.net', file, { ptt: true })
  const payload = calls[0].payload as { audio?: Buffer; ptt?: boolean }
  assert.ok(payload.audio instanceof Buffer)
  assert.equal(payload.audio.toString(), 'AUDIODATA')
  assert.equal(payload.ptt, true)
  assert.deepEqual(result, { key: { id: 'MSGID123' }, type: 'audio' })
})

test('sendMedia envía video con caption', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'waat-send-'))
  const file = join(dir, 'video.mp4')
  writeFileSync(file, 'VIDEODATA')
  const { sock, calls } = fakeSocket()
  const result = await sendMedia(sock as any, 'c@s.whatsapp.net', file, { caption: 'clip' })
  const payload = calls[0].payload as { video?: Buffer; caption?: string }
  assert.ok(payload.video instanceof Buffer)
  assert.equal(payload.video.toString(), 'VIDEODATA')
  assert.equal(payload.caption, 'clip')
  assert.deepEqual(result, { key: { id: 'MSGID123' }, type: 'video' })
})

test('sendMedia envía documento con mimetype y fileName', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'waat-send-'))
  const file = join(dir, 'informe.pdf')
  writeFileSync(file, 'PDFDATA')
  const { sock, calls } = fakeSocket()
  const result = await sendMedia(sock as any, 'c@s.whatsapp.net', file, { caption: 'informe' })
  const payload = calls[0].payload as {
    document?: Buffer
    mimetype?: string
    fileName?: string
    caption?: string
  }
  assert.ok(payload.document instanceof Buffer)
  assert.equal(payload.document.toString(), 'PDFDATA')
  assert.equal(payload.mimetype, 'application/pdf')
  assert.equal(payload.fileName, 'informe.pdf')
  assert.equal(payload.caption, 'informe')
  assert.deepEqual(result, { key: { id: 'MSGID123' }, type: 'application' })
})

test('sendMedia lanza FileError not_found si el archivo no existe', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'waat-send-'))
  const { sock, calls } = fakeSocket()
  await assert.rejects(
    sendMedia(sock as any, 'c@s.whatsapp.net', join(dir, 'no-existe.jpg'), {}),
    (err: unknown) => err instanceof FileError && err.code === 'not_found',
  )
  assert.equal(calls.length, 0)
})

test('sendMedia lanza FileError not_absolute con ruta relativa', async () => {
  const { sock, calls } = fakeSocket()
  await assert.rejects(
    sendMedia(sock as any, 'c@s.whatsapp.net', 'foto.jpg', {}),
    (err: unknown) => err instanceof FileError && err.code === 'not_absolute',
  )
  assert.equal(calls.length, 0)
})

test('sendMedia lanza FileError not_a_file si es un directorio', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'waat-send-'))
  const sub = join(dir, 'sub')
  mkdirSync(sub)
  const { sock, calls } = fakeSocket()
  await assert.rejects(
    sendMedia(sock as any, 'c@s.whatsapp.net', sub, {}),
    (err: unknown) => err instanceof FileError && err.code === 'not_a_file',
  )
  assert.equal(calls.length, 0)
})

test('sendMedia lanza FileError too_large sobre MAX_FILE_BYTES', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'waat-send-'))
  const file = join(dir, 'grande.mp4')
  const fd = openSync(file, 'w')
  ftruncateSync(fd, MAX_FILE_BYTES + 1)
  closeSync(fd)
  const { sock, calls } = fakeSocket()
  await assert.rejects(
    sendMedia(sock as any, 'c@s.whatsapp.net', file, {}),
    (err: unknown) => err instanceof FileError && err.code === 'too_large',
  )
  assert.equal(calls.length, 0)
})

test('sendMedia lanza si sendMessage no devuelve mensaje', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'waat-send-'))
  const file = join(dir, 'foto.jpg')
  writeFileSync(file, 'IMGDATAS')
  const sock = { sendMessage: async () => undefined }
  await assert.rejects(
    sendMedia(sock as any, 'c@s.whatsapp.net', file, {}),
    /no devolvió mensaje/,
  )
})
