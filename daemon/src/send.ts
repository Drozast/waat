import { readFile, stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import type { WASocket, AnyMessageContent } from '@whiskeysockets/baileys'

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  opus: 'audio/ogg',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  avi: 'video/x-msvideo',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  zip: 'application/zip',
  txt: 'text/plain',
}

export const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50 MB

export type FileErrorCode = 'not_found' | 'not_a_file' | 'not_absolute' | 'too_large'

export class FileError extends Error {
  constructor(
    public readonly code: FileErrorCode,
    message: string,
  ) {
    super(message)
  }
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
  if (!msg) throw new Error('sendMessage no devolvió mensaje')
  return { id: msg.key.id! }
}

export async function sendMedia(
  sock: WASocket,
  chatId: string,
  filePath: string,
  opts: { caption?: string; ptt?: boolean }
): Promise<{ key: { id: string }; type: string }> {
  if (!isAbsolute(filePath)) throw new FileError('not_absolute', `ruta no absoluta: ${filePath}`)
  let st
  try {
    st = await stat(filePath)
  } catch {
    throw new FileError('not_found', `archivo no existe: ${filePath}`)
  }
  if (!st.isFile()) throw new FileError('not_a_file', `no es un archivo: ${filePath}`)
  if (st.size > MAX_FILE_BYTES) {
    throw new FileError('too_large', `archivo demasiado grande: ${filePath}`)
  }
  const buf = await readFile(filePath)
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
  if (!msg) throw new Error('sendMessage no devolvió mensaje')
  return { key: { id: msg.key.id! }, type: mime.split('/')[0] }
}
