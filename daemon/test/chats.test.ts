import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatMessages, chatSlug, listChats, readChat, searchMessages } from '../src/chats.js'

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

test('listChats filtra @broadcast, mapea campos y ordena por unread desc', () => {
  const chats = [
    { id: '111@s.whatsapp.net', name: 'Beto', unreadCount: 2 },
    { id: 'status@broadcast', name: 'Status', unreadCount: 9 },
    { id: '222@g.us', name: 'Alfa', unreadCount: 2 },
    { id: '333@s.whatsapp.net', name: 'Ana', unreadCount: 0 },
  ]
  const store = fakeStore(chats, {
    '111@s.whatsapp.net': {
      array: [{ key: { id: 'x' }, message: { conversation: 'hola' } }],
    },
  })
  const out = listChats(store)
  assert.deepEqual(
    out.map((c) => c.id),
    ['222@g.us', '111@s.whatsapp.net', '333@s.whatsapp.net']
  )
  const beto = out.find((c) => c.id === '111@s.whatsapp.net')!
  assert.equal(beto.name, 'Beto')
  assert.equal(beto.isGroup, false)
  assert.equal(beto.lastMessage, 'hola')
  assert.equal(beto.unreadCount, 2)
  const alfa = out.find((c) => c.id === '222@g.us')!
  assert.equal(alfa.isGroup, true)
  assert.equal(alfa.lastMessage, '')
})

test('readChat pagina y expone nextBefore', async () => {
  const msgs = Array.from({ length: 10 }, (_, i) => ({
    key: { id: `m${i}`, fromMe: false },
    pushName: 'Juan',
    message: { conversation: `msg ${i}` },
  }))
  const store = fakeStore([{ id: 'c1@s.whatsapp.net', name: 'C1' }], {
    'c1@s.whatsapp.net': { array: msgs },
  })
  const p1 = await readChat(store, 'c1@s.whatsapp.net', { limit: 3 })
  assert.equal(p1.count, 3)
  assert.ok(p1.messages.includes('Juan: msg 9'))
  assert.ok(p1.messages.includes('Juan: msg 8'))
  assert.ok(p1.messages.includes('Juan: msg 7'))
  assert.ok(!p1.messages.includes('msg 6'))
  assert.equal(p1.nextBefore, 'm0')
  const full = await readChat(store, 'c1@s.whatsapp.net', { limit: 50 })
  assert.equal(full.count, 10)
  assert.equal(full.nextBefore, null)
})

test('searchMessages filtra por texto y devuelve chatName', async () => {
  const chats = [
    { id: '111@s.whatsapp.net', name: 'Beto' },
    { id: '222@s.whatsapp.net', name: 'Ana' },
  ]
  const store = fakeStore(chats, {
    '111@s.whatsapp.net': {
      array: [
        { key: { id: 'a', fromMe: false }, pushName: 'Beto', message: { conversation: 'hola mundo' } },
        { key: { id: 'b', fromMe: false }, pushName: 'Beto', message: { conversation: 'adios' } },
      ],
    },
    '222@s.whatsapp.net': {
      array: [
        { key: { id: 'c', fromMe: false }, pushName: 'Ana', message: { conversation: 'mundo feliz' } },
      ],
    },
  })
  const res = await searchMessages(store, 'mundo')
  assert.equal(res.length, 2)
  const beto = res.find((r) => r.chatId === '111@s.whatsapp.net')!
  assert.equal(beto.chatName, 'Beto')
  assert.ok(beto.matches.includes('Beto: hola mundo'))
  assert.ok(!beto.matches.includes('adios'))
  const ana = res.find((r) => r.chatId === '222@s.whatsapp.net')!
  assert.equal(ana.chatName, 'Ana')
  assert.ok(ana.matches.includes('Ana: mundo feliz'))
})

function fakeStore(
  chats: any[],
  messages: Record<string, { array: any[] }> = {}
): any {
  return {
    chats: { all: () => chats },
    messages,
    loadMessages: async (jid: string) => messages[jid]?.array ?? [],
  }
}
