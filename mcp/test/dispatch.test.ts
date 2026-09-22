import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dispatchTool } from '../src/dispatch.js'
import type { WaatClient, WaatResponse } from '../src/client.js'

function makeStub() {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const sentinel = (label: string): WaatResponse => ({ ok: true, data: { label } })
  const stub = {
    status: () => { calls.push({ method: 'status', args: [] }); return Promise.resolve(sentinel('status')) },
    link: () => { calls.push({ method: 'link', args: [] }); return Promise.resolve(sentinel('link')) },
    listChats: (q?: string) => { calls.push({ method: 'listChats', args: [q] }); return Promise.resolve(sentinel('listChats')) },
    readChat: (chatId: string, limit?: number, before?: string) => { calls.push({ method: 'readChat', args: [chatId, limit, before] }); return Promise.resolve(sentinel('readChat')) },
    search: (q: string, chatId?: string) => { calls.push({ method: 'search', args: [q, chatId] }); return Promise.resolve(sentinel('search')) },
    downloadMedia: (chatId: string, messageKey: string) => { calls.push({ method: 'downloadMedia', args: [chatId, messageKey] }); return Promise.resolve(sentinel('downloadMedia')) },
    sendText: (chatId: string, text: string) => { calls.push({ method: 'sendText', args: [chatId, text] }); return Promise.resolve(sentinel('sendText')) },
    sendMedia: (chatId: string, filePath: string, caption?: string, ptt?: boolean) => { calls.push({ method: 'sendMedia', args: [chatId, filePath, caption, ptt] }); return Promise.resolve(sentinel('sendMedia')) },
  }
  return { stub: stub as unknown as WaatClient, calls }
}

test('waat_status dispatcha a client.status', async () => {
  const { stub, calls } = makeStub()
  const r = await dispatchTool('waat_status', {}, stub)
  assert.deepEqual(r.data, { label: 'status' })
  assert.deepEqual(calls, [{ method: 'status', args: [] }])
})

test('waat_link dispatcha a client.link', async () => {
  const { stub, calls } = makeStub()
  const r = await dispatchTool('waat_link', {}, stub)
  assert.deepEqual(r.data, { label: 'link' })
  assert.deepEqual(calls, [{ method: 'link', args: [] }])
})

test('waat_list_chats dispatcha a client.listChats con q', async () => {
  const { stub, calls } = makeStub()
  await dispatchTool('waat_list_chats', { q: 'ana' }, stub)
  assert.deepEqual(calls, [{ method: 'listChats', args: ['ana'] }])
})

test('waat_list_chats sin q pasa undefined', async () => {
  const { stub, calls } = makeStub()
  await dispatchTool('waat_list_chats', {}, stub)
  assert.deepEqual(calls, [{ method: 'listChats', args: [undefined] }])
})

test('waat_read_chat dispatcha a client.readChat con chatId, limit, before', async () => {
  const { stub, calls } = makeStub()
  await dispatchTool('waat_read_chat', { chatId: '123@c.us', limit: 50, before: 'k1' }, stub)
  assert.deepEqual(calls, [{ method: 'readChat', args: ['123@c.us', 50, 'k1'] }])
})

test('waat_read_chat sin opcionales pasa undefined', async () => {
  const { stub, calls } = makeStub()
  await dispatchTool('waat_read_chat', { chatId: '123@c.us' }, stub)
  assert.deepEqual(calls, [{ method: 'readChat', args: ['123@c.us', undefined, undefined] }])
})

test('waat_search dispatcha a client.search con q y chatId', async () => {
  const { stub, calls } = makeStub()
  await dispatchTool('waat_search', { q: 'hola', chatId: '123@c.us' }, stub)
  assert.deepEqual(calls, [{ method: 'search', args: ['hola', '123@c.us'] }])
})

test('waat_search sin chatId pasa undefined', async () => {
  const { stub, calls } = makeStub()
  await dispatchTool('waat_search', { q: 'hola' }, stub)
  assert.deepEqual(calls, [{ method: 'search', args: ['hola', undefined] }])
})

test('waat_download_media dispatcha a client.downloadMedia', async () => {
  const { stub, calls } = makeStub()
  await dispatchTool('waat_download_media', { chatId: '123@c.us', messageKey: 'k1' }, stub)
  assert.deepEqual(calls, [{ method: 'downloadMedia', args: ['123@c.us', 'k1'] }])
})

test('waat_send_text dispatcha a client.sendText', async () => {
  const { stub, calls } = makeStub()
  await dispatchTool('waat_send_text', { chatId: '123@c.us', text: 'hola' }, stub)
  assert.deepEqual(calls, [{ method: 'sendText', args: ['123@c.us', 'hola'] }])
})

test('waat_send_media dispatcha a client.sendMedia con todos los args', async () => {
  const { stub, calls } = makeStub()
  await dispatchTool('waat_send_media', { chatId: '123@c.us', filePath: '/tmp/a.png', caption: 'cap', ptt: true }, stub)
  assert.deepEqual(calls, [{ method: 'sendMedia', args: ['123@c.us', '/tmp/a.png', 'cap', true] }])
})

test('waat_send_media sin opcionales pasa undefined', async () => {
  const { stub, calls } = makeStub()
  await dispatchTool('waat_send_media', { chatId: '123@c.us', filePath: '/tmp/a.png' }, stub)
  assert.deepEqual(calls, [{ method: 'sendMedia', args: ['123@c.us', '/tmp/a.png', undefined, undefined] }])
})

test('tool desconocida devuelve error estructurado', async () => {
  const { stub, calls } = makeStub()
  const r = await dispatchTool('waat_no_existe', {}, stub)
  assert.equal(r.ok, false)
  assert.equal(r.error, 'tool desconocida: waat_no_existe')
  assert.deepEqual(calls, [])
})

test('dispatchTool devuelve el resultado del cliente (isError: !result.ok)', async () => {
  const failing: WaatClient = {
    status: () => Promise.resolve({ ok: false, error: 'offline' }),
  } as unknown as WaatClient
  const r = await dispatchTool('waat_status', {}, failing)
  assert.equal(r.ok, false)
  assert.equal(r.error, 'offline')
  assert.equal(!r.ok, true)
})
