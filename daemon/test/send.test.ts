import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mimeForFile } from '../src/send.js'

test('mimeForFile resuelve tipos comunes', () => {
  assert.equal(mimeForFile('foto.jpg'), 'image/jpeg')
  assert.equal(mimeForFile('foto.png'), 'image/png')
  assert.equal(mimeForFile('nota.opus'), 'audio/ogg')
  assert.equal(mimeForFile('video.mp4'), 'video/mp4')
  assert.equal(mimeForFile('doc.pdf'), 'application/pdf')
  assert.equal(mimeForFile('archivo.xyz'), 'application/octet-stream')
})
