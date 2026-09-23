#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { WaatClient } from './client.js'
import { dispatchTool } from './dispatch.js'
import { ensureDaemon } from './daemon.js'

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

// El MCP vive en <root>/mcp/dist/index.js; el daemon en <root>/daemon/dist/index.js.
// Funciona igual en el repo que en node_modules/waat (mismo layout).
const DAEMON_JS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'daemon', 'dist', 'index.js')

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
  // Auto-spawn: si el daemon no está, lo arranca y espera a que responda.
  // Si no se pudo arrancar, la tool devuelve offline con hint (no crash).
  await ensureDaemon({ waatDir: WAAT_DIR, port: PORT, daemonJs: DAEMON_JS })
  // El daemon recién arrancado puede haber creado el token; refrescamos.
  client.setToken(readToken(WAAT_DIR))
  const args = (req.params.arguments ?? {}) as Record<string, unknown>
  const result = await dispatchTool(req.params.name, args, client)
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    isError: !result.ok,
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
