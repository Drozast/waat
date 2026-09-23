import {
  toNumber,
  type BaileysEventEmitter,
  type Chat,
  type Contact,
  type WAMessage,
  type WAMessageCursor,
} from '@whiskeysockets/baileys'
import type { ILogger } from '@whiskeysockets/baileys/lib/Utils/logger.js'

/**
 * Store in-memory propio para Baileys 7.x.
 *
 * En 7.x `makeInMemoryStore` fue removido del paquete (no es named export ni
 * default), así que reconstruimos aquí solo la superficie que el daemon usa:
 *   - chats.all() / chats.get(jid)
 *   - messages[jid].array
 *   - contacts[jid]
 *   - bind(ev)
 *   - loadMessages(jid, count, cursor)
 *
 * La semántica replica al store de 6.x: los mensajes se guardan por chat en
 * orden cronológico y `loadMessages` devuelve los últimos `count` mensajes.
 */

export interface InMemoryStoreConfig {
  logger?: ILogger
}

export interface ChatCollection {
  all(): Chat[]
  get(jid: string): Chat | undefined
}

export interface MessageCollection {
  array: WAMessage[]
}

export interface InMemoryStore {
  chats: ChatCollection
  contacts: Record<string, Contact>
  messages: Record<string, MessageCollection>
  bind(ev: BaileysEventEmitter): void
  loadMessages(
    jid: string,
    count: number,
    cursor?: WAMessageCursor,
  ): Promise<WAMessage[]>
}

export function makeInMemoryStore(config: InMemoryStoreConfig = {}): InMemoryStore {
  const logger = config.logger
  const chats = new Map<string, Chat>()
  const contacts: Record<string, Contact> = {}
  const messages: Record<string, MessageCollection> = {}

  function upsertChat(chat: Chat): void {
    const id = chat.id
    if (!id) return
    const existing = chats.get(id)
    chats.set(id, existing ? { ...existing, ...chat } : { ...chat })
  }

  function upsertContact(contact: Contact): void {
    const id = contact.id
    if (!id) return
    contacts[id] = { ...contacts[id], ...contact }
  }

  function messageList(jid: string): MessageCollection {
    let list = messages[jid]
    if (!list) {
      list = { array: [] }
      messages[jid] = list
    }
    return list
  }

  function upsertMessage(msg: WAMessage): void {
    const jid = msg.key?.remoteJid
    if (!jid) return
    const list = messageList(jid)
    const id = msg.key.id
    const idx = id
      ? list.array.findIndex((m) => m.key.id === id)
      : -1
    if (idx >= 0) {
      list.array[idx] = msg
    } else {
      list.array.push(msg)
    }
    list.array.sort(
      (a, b) =>
        toNumber(a.messageTimestamp ?? 0) - toNumber(b.messageTimestamp ?? 0),
    )
  }

  function updateMessage(update: {
    key: { remoteJid?: string | null; id?: string | null }
    update: Partial<WAMessage>
  }): void {
    const jid = update.key.remoteJid
    const id = update.key.id
    if (!jid || !id) return
    const list = messages[jid]
    if (!list) return
    const idx = list.array.findIndex((m) => m.key.id === id)
    if (idx >= 0) {
      list.array[idx] = { ...list.array[idx], ...update.update }
    }
  }

  function deleteMessages(
    item:
      | { keys: { remoteJid?: string | null; id?: string | null }[] }
      | { jid?: string | null; all?: boolean },
  ): void {
    if ('keys' in item) {
      for (const key of item.keys) {
        const jid = key.remoteJid
        const id = key.id
        if (!jid || !id) continue
        const list = messages[jid]
        if (!list) continue
        list.array = list.array.filter((m) => m.key.id !== id)
      }
    } else if (item.jid) {
      if (item.all) {
        delete messages[item.jid]
      } else {
        const list = messages[item.jid]
        if (list) list.array = []
      }
    }
  }

  const bind = (ev: BaileysEventEmitter): void => {
    ev.on('messaging-history.set', ({ chats: newChats, contacts: newContacts, messages: newMessages }) => {
      for (const c of newChats) upsertChat(c)
      for (const c of newContacts) upsertContact(c)
      for (const m of newMessages) upsertMessage(m)
      logger?.debug(
        { chats: newChats.length, contacts: newContacts.length, messages: newMessages.length },
        'waat store: synced history',
      )
    })
    ev.on('chats.upsert', (newChats) => {
      for (const c of newChats) upsertChat(c)
    })
    ev.on('chats.update', (updates) => {
      for (const u of updates) {
        const id = u.id
        if (!id) continue
        const existing = chats.get(id)
        if (existing) chats.set(id, { ...existing, ...u })
      }
    })
    ev.on('chats.delete', (jids) => {
      for (const jid of jids) chats.delete(jid)
    })
    ev.on('contacts.upsert', (newContacts) => {
      for (const c of newContacts) upsertContact(c)
    })
    ev.on('contacts.update', (updates) => {
      for (const u of updates) {
        const id = u.id
        if (!id) continue
        contacts[id] = { ...contacts[id], ...u }
      }
    })
    ev.on('messages.upsert', ({ messages: newMessages }) => {
      for (const m of newMessages) upsertMessage(m)
    })
    ev.on('messages.update', (updates) => {
      for (const u of updates) updateMessage(u)
    })
    ev.on('messages.delete', (item) => {
      deleteMessages(item)
    })
  }

  const loadMessages = async (
    jid: string,
    count: number,
    _cursor?: WAMessageCursor,
  ): Promise<WAMessage[]> => {
    const list = messages[jid]
    if (!list) return []
    const arr = list.array
    return count >= arr.length ? [...arr] : arr.slice(-count)
  }

  return {
    chats: {
      all: () => [...chats.values()],
      get: (jid: string) => chats.get(jid),
    },
    contacts,
    messages,
    bind,
    loadMessages,
  }
}

export default makeInMemoryStore
