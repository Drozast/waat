import { toNumber, type WASocket, type WAMessage, type WAMessageContent } from '@whiskeysockets/baileys'

// Baileys 6.17.x no expone `chats` ni `fetchMessages` en el tipo WASocket
// (viven en el Store API), así que describimos la superficie mínima que usamos.
export interface ChatInfo {
  id: string
  name?: string
  conversation?: string
  unreadCount?: number
}

export interface ChatSocket {
  chats: { all: ChatInfo[] }
  fetchMessages: (chatId: string) => Promise<WAMessage[]>
}

function chatApi(sock: WASocket): ChatSocket {
  return sock as unknown as ChatSocket
}

export interface ChatSummary {
  id: string
  name: string
  isGroup: boolean
  lastMessage: string
  unreadCount: number
}

export function chatSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function mediaType(m: WAMessageContent | null | undefined): string | null {
  if (!m) return null
  if (m.imageMessage) return 'imagen'
  if (m.videoMessage) return 'video'
  if (m.audioMessage) return 'audio'
  if (m.documentMessage) return 'documento'
  return null
}

function textOf(m: WAMessageContent | null | undefined): string {
  return m?.conversation ?? m?.extendedTextMessage?.text ?? ''
}

export function formatMessages(msgs: WAMessage[]): string {
  const lines: string[] = []
  for (const m of msgs) {
    const ts = m.messageTimestamp
      ? new Date(toNumber(m.messageTimestamp) * 1000).toISOString().replace('T', ' ').slice(0, 16)
      : '?'
    const who = m.key.fromMe ? 'Tú' : m.pushName ?? '???'
    const body = textOf(m.message)
    const mt = mediaType(m.message)
    const caption =
      m.message?.imageMessage?.caption ?? m.message?.videoMessage?.caption ?? ''
    const parts: string[] = []
    if (body) parts.push(body)
    if (mt) parts.push(`[${mt}]${caption ? ` ${caption}` : ''}`)
    lines.push(`${ts} | ${who}: ${parts.join(' ')}`.trim())
  }
  return lines.join('\n')
}

export function listChats(sock: WASocket): ChatSummary[] {
  return chatApi(sock).chats.all
    .filter((c) => c.id && !c.id.endsWith('@broadcast'))
    .map((c) => ({
      id: c.id,
      name: c.name ?? c.id,
      isGroup: c.id.endsWith('@g.us'),
      lastMessage: (c.conversation ?? '').slice(0, 120),
      unreadCount: c.unreadCount ?? 0,
    }))
    .sort((a, b) => b.unreadCount - a.unreadCount || a.name.localeCompare(b.name))
}

export async function readChat(
  sock: WASocket,
  chatId: string,
  opts: { limit?: number; before?: string }
): Promise<{ messages: string; nextBefore: string | null; count: number }> {
  const all = await chatApi(sock).fetchMessages(chatId)
  const limit = Math.min(opts.limit ?? 50, 200)
  let msgs = all
  if (opts.before) {
    const idx = all.findIndex((m) => m.key.id === opts.before)
    if (idx >= 0) msgs = all.slice(0, idx)
  }
  const page = msgs.slice(-limit).reverse()
  const nextBefore = msgs.length > limit ? (msgs[0].key.id ?? null) : null
  return { messages: formatMessages(page), nextBefore, count: page.length }
}

export async function searchMessages(
  sock: WASocket,
  query: string,
  chatId?: string
): Promise<{ chatId: string; chatName: string; matches: string }[]> {
  const q = query.toLowerCase()
  const api = chatApi(sock)
  const ids = chatId ? [chatId] : api.chats.all.map((c) => c.id)
  const results: { chatId: string; chatName: string; matches: string }[] = []
  for (const id of ids) {
    const msgs = await api.fetchMessages(id)
    const hits = msgs.filter((m) => textOf(m.message).toLowerCase().includes(q))
    if (hits.length > 0) {
      const chat = api.chats.all.find((c) => c.id === id)
      results.push({
        chatId: id,
        chatName: chat?.name ?? id,
        matches: formatMessages(hits.slice(-20)),
      })
    }
  }
  return results
}
