import { readFileSync, existsSync } from 'node:fs'
import type { WASocket, AnyMessageContent } from '@whiskeysockets/baileys'

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  opus: 'audio/ogg',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
  txt: 'text/plain',
}

export function mimeForFile(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return MIME[ext] ?? 'application/octet-stream'
}

export async function sendText(
  sock: WASocket,
  chatId: string,
  text: string
): Promise<{ id: string }> {
  const msg = await sock.sendMessage(chatId, { text })
  return { id: msg!.key.id! }
}

export async function sendMedia(
  sock: WASocket,
  chatId: string,
  filePath: string,
  opts: { caption?: string; ptt?: boolean }
): Promise<{ key: { id: string }; type: string }> {
  if (!existsSync(filePath)) throw new Error(`archivo no existe: ${filePath}`)
  const buf = readFileSync(filePath)
  const mime = mimeForFile(filePath)
  const fileName = filePath.split('/').pop() ?? 'archivo'

  let payload: AnyMessageContent
  if (mime.startsWith('image/')) {
    payload = { image: buf, caption: opts.caption }
  } else if (mime.startsWith('audio/')) {
    payload = { audio: buf, ptt: opts.ptt ?? false }
  } else if (mime.startsWith('video/')) {
    payload = { video: buf, caption: opts.caption }
  } else {
    payload = { document: buf, mimetype: mime, fileName, caption: opts.caption }
  }
  const msg = await sock.sendMessage(chatId, payload)
  return { key: { id: msg!.key.id! }, type: mime.split('/')[0] }
}
