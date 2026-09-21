import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mediaFileName, transcribeAudio, type Transcriber } from '../src/media.js'

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
