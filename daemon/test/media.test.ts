import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  mediaFileName,
  transcribeAudio,
  downloadMedia,
  setMediaDownloader,
  type Transcriber,
} from '../src/media.js'
import type { ChatStore } from '../src/chats.js'
import type { WAMessage } from '@whiskeysockets/baileys'

function fakeStore(msgs: WAMessage[]): ChatStore {
  return { loadMessages: async () => msgs } as unknown as ChatStore
}

function stubDownloader(buf: Buffer) {
  return setMediaDownloader(async () => buf)
}

test('mediaFileName genera nombre estable sin colisiones', () => {
  const ts = new Date('2026-09-20T14:33:01Z')
  const name = mediaFileName(ts, 'imagen', 'jpg')
  assert.equal(name, '2026-09-20T14-33-01-imagen.jpg')
})

test('transcribeAudio con transcriber fake escribe .txt junto al audio', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'waat-media-'))
  const audioPath = join(dir, 'a.opus')
  writeFileSync(audioPath, 'fake-audio')
  const fake: Transcriber = async () => 'hola mundo'
  const out = await transcribeAudio(audioPath, fake)
  assert.equal(out.transcription, 'hola mundo')
  assert.ok(existsSync(join(dir, 'a.txt')))
  assert.equal(readFileSync(join(dir, 'a.txt'), 'utf8'), 'hola mundo')
})

test('transcribeAudio con transcriber null no transcribe', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'waat-media-'))
  const audioPath = join(dir, 'a.opus')
  writeFileSync(audioPath, 'fake-audio')
  const out = await transcribeAudio(audioPath, null)
  assert.equal(out.transcription, null)
})

test('downloadMedia: mensaje no encontrado lanza', async () => {
  const restore = stubDownloader(Buffer.from('x'))
  try {
    const store = fakeStore([{ key: { id: 'other' }, message: { imageMessage: {} } }])
    await assert.rejects(
      downloadMedia(store, 'c@s.whatsapp.net', 'Chat', 'missing', '/tmp/waat-dm', null),
      /mensaje no encontrado/,
    )
  } finally {
    setMediaDownloader(restore)
  }
})

test('downloadMedia: mensaje sin media lanza', async () => {
  const restore = stubDownloader(Buffer.from('x'))
  try {
    const store = fakeStore([{ key: { id: 'm1' }, message: { conversation: 'hola' } }])
    await assert.rejects(
      downloadMedia(store, 'c@s.whatsapp.net', 'Chat', 'm1', '/tmp/waat-dm', null),
      /no contiene media/,
    )
  } finally {
    setMediaDownloader(restore)
  }
})

test('downloadMedia: imagen escribe archivo sin transcripción', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'waat-dm-'))
  const restore = stubDownloader(Buffer.from('IMGDATA'))
  try {
    const store = fakeStore([
      { key: { id: 'm1' }, messageTimestamp: 1758000000, message: { imageMessage: { caption: 'foto' } } },
    ])
    const res = await downloadMedia(store, 'c@s.whatsapp.net', 'Chat', 'm1', dir, null)
    assert.equal(res.type, 'imagen')
    assert.equal(res.transcription, undefined)
    assert.ok(existsSync(res.path))
    assert.equal(readFileSync(res.path, 'utf8'), 'IMGDATA')
  } finally {
    setMediaDownloader(restore)
  }
})

test('downloadMedia: audio transcribe y escribe .txt junto al audio', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'waat-dm-'))
  const restore = stubDownloader(Buffer.from('AUDIODATA'))
  try {
    const store = fakeStore([
      { key: { id: 'm1' }, messageTimestamp: 1758000000, message: { audioMessage: {} } },
    ])
    const transcriber: Transcriber = async () => 'hola mundo'
    const res = await downloadMedia(store, 'c@s.whatsapp.net', 'Chat', 'm1', dir, transcriber)
    assert.equal(res.type, 'audio')
    assert.equal(res.transcription, 'hola mundo')
    assert.ok(existsSync(res.path))
    const txtPath = res.path.replace(/\.[^.]+$/, '.txt')
    assert.ok(existsSync(txtPath))
    assert.equal(readFileSync(txtPath, 'utf8'), 'hola mundo')
  } finally {
    setMediaDownloader(restore)
  }
})

test('downloadMedia: imagen efímera (ephemeralMessage) se detecta y descarga', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'waat-dm-'))
  const restore = stubDownloader(Buffer.from('EPHEMERAL'))
  try {
    const store = fakeStore([
      {
        key: { id: 'm1' },
        messageTimestamp: 1758000000,
        message: { ephemeralMessage: { message: { imageMessage: { caption: 'temporal' } } } },
      },
    ])
    const res = await downloadMedia(store, 'c@s.whatsapp.net', 'Chat', 'm1', dir, null)
    assert.equal(res.type, 'imagen')
    assert.ok(existsSync(res.path))
    assert.equal(readFileSync(res.path, 'utf8'), 'EPHEMERAL')
  } finally {
    setMediaDownloader(restore)
  }
})
