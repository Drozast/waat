#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { WaatClient, type WaatResponse } from './client.js'

function readToken(dir: string): string {
  const p = join(dir, 'token')
  return existsSync(p) ? readFileSync(p, 'utf8').trim() : ''
}

const WAAT_DIR = process.env.WAAT_DIR ?? `${process.env.HOME}/.waat`
const PORT = Number(process.env.WAAT_PORT ?? 8787)
const client = new WaatClient({
  baseUrl: `http://127.0.0.1:${PORT}`,
  token: readToken(WAAT_DIR),
})

const TOOLS = [
  {
    name: 'waat_status',
    description: 'Estado de la conexión WhatsApp: online/offline, sesión, nº de chats',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'waat_link',
    description: 'Genera el QR para vincular WhatsApp (una vez). Devuelve la ruta del PNG.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'waat_list_chats',
    description: 'Lista conversaciones (nombre, último mensaje, unread). Filtrable por texto.',
    inputSchema: {
      type: 'object',
      properties: { q: { type: 'string', description: 'filtro por nombre' } },
    },
  },
  {
    name: 'waat_read_chat',
    description: 'Lee mensajes de una conversación (paginado). Devuelve texto formateado para LLM.',
    inputSchema: {
      type: 'object',
      properties: {
        chatId: { type: 'string' },
        limit: { type: 'number', description: 'máx 200, default 50' },
        before: { type: 'string', description: 'cursor: key.id del mensaje anterior' },
      },
      required: ['chatId'],
    },
  },
  {
    name: 'waat_search',
    description: 'Busca texto en mensajes de un chat o en todos',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string' },
        chatId: { type: 'string' },
      },
      required: ['q'],
    },
  },
  {
    name: 'waat_download_media',
    description: 'Descarga media de un mensaje a ~/waat/<chat>/ y transcribe audios con Whisper',
    inputSchema: {
      type: 'object',
      properties: {
        chatId: { type: 'string' },
        messageKey: { type: 'string', description: 'key.id del mensaje (de waat_read_chat)' },
      },
      required: ['chatId', 'messageKey'],
    },
  },
  {
    name: 'waat_send_text',
    description: 'Envía un mensaje de texto a una conversación',
    inputSchema: {
      type: 'object',
      properties: {
        chatId: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['chatId', 'text'],
    },
  },
  {
    name: 'waat_send_media',
    description: 'Envía imagen/audio/video/archivo desde una ruta local',
    inputSchema: {
      type: 'object',
      properties: {
        chatId: { type: 'string' },
        filePath: { type: 'string' },
        caption: { type: 'string' },
        ptt: { type: 'boolean', description: 'true para audio como nota de voz' },
      },
      required: ['chatId', 'filePath'],
    },
  },
]

const server = new Server(
  { name: 'waat', version: '0.1.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const args = (req.params.arguments ?? {}) as Record<string, unknown>
  const call = async (): Promise<WaatResponse> => {
    switch (req.params.name) {
      case 'waat_status': return client.status()
      case 'waat_link': return client.link()
      case 'waat_list_chats': return client.listChats(args.q as string | undefined)
      case 'waat_read_chat':
        return client.readChat(args.chatId as string, args.limit as number | undefined, args.before as string | undefined)
      case 'waat_search': return client.search(args.q as string, args.chatId as string | undefined)
      case 'waat_download_media':
        return client.downloadMedia(args.chatId as string, args.messageKey as string)
      case 'waat_send_text': return client.sendText(args.chatId as string, args.text as string)
      case 'waat_send_media':
        return client.sendMedia(args.chatId as string, args.filePath as string, args.caption as string | undefined, args.ptt as boolean | undefined)
      default:
        return { ok: false, error: `tool desconocida: ${req.params.name}` }
    }
  }
  const result = await call()
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    isError: !result.ok,
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
