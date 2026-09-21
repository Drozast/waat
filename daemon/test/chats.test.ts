import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatMessages, chatSlug } from '../src/chats.js'

test('chatSlug normaliza nombres', () => {
  assert.equal(chatSlug('Juan Pérez'), 'juan-perez')
  assert.equal(chatSlug('  TRABAJO  '), 'trabajo')
  assert.equal(chatSlug('café & más!'), 'cafe-mas')
})

test('formatMessages produce formato compacto para LLM', () => {
  const msgs = [
    { key: { id: 'm1', fromMe: false }, pushName: 'Juan', message: { conversation: 'hola' }, timestamp: 1758000000 },
    { key: { id: 'm2', fromMe: true }, pushName: 'Tú', message: { imageMessage: { caption: 'foto' } }, timestamp: 1758000060 },
  ] as any
  const out = formatMessages(msgs)
  assert.ok(out.includes('Juan: hola'))
  assert.ok(out.includes('Tú: [imagen] foto'))
})

test('formatMessages maneja mensajes sin body', () => {
  const msgs = [{ key: { id: 'm1', fromMe: false }, pushName: 'Ana', message: {}, timestamp: 1758000000 }] as any
  const out = formatMessages(msgs)
  assert.ok(out.includes('Ana:'))
})
