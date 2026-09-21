import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { downloadMediaMessage, toNumber } from '@whiskeysockets/baileys'
import { chatSlug, loadAll, type ChatStore } from './chats.js'

const pExecFile = promisify(execFile)

export type Transcriber = (audioPath: string) => Promise<string>

export function defaultTranscriber(model: string, lang: string): Transcriber {
  return async (audioPath: string) => {
    await pExecFile('whisper', [
      audioPath,
      '--language', lang,
      '--model', model,
      '--output_format', 'txt',
      '--output_dir', join('/tmp', 'waat-whisper'),
      '--fp16', 'False',
    ])
    // whisper escribe <output_dir>/<basename sin ext>.txt
    const base = basename(audioPath).replace(/\.[^.]+$/, '')
    const txtPath = join('/tmp', 'waat-whisper', `${base}.txt`)
    return readFileSync(txtPath, 'utf8').trim()
  }
}

export function mediaFileName(ts: Date, tipo: string, ext: string): string {
  const stamp = ts.toISOString().replace(/[:]/g, '-').replace(/\.\d+Z$/, '')
  return `${stamp}-${tipo}.${ext}`
}

export async function transcribeAudio(
  audioPath: string,
  transcriber: Transcriber | null
): Promise<{ transcription: string | null; error?: string }> {
  if (!transcriber) return { transcription: null }
  try {
    const text = await transcriber(audioPath)
    const txtPath = audioPath.replace(/\.[^.]+$/, '.txt')
    writeFileSync(txtPath, text)
    return { transcription: text }
  } catch (err) {
    return { transcription: null, error: String(err) }
  }
}

export interface DownloadResult {
  messageKey: string
  type: string
  path: string
  transcription?: string | null
  transcriptionError?: string
}

export async function downloadMedia(
  store: ChatStore,
  chatId: string,
  chatName: string,
  messageKey: string,
  exportDir: string,
  transcriber: Transcriber | null
): Promise<DownloadResult> {
  const msgs = await loadAll(store, chatId)
  const msg = msgs.find((m) => m.key.id === messageKey)
  if (!msg) throw new Error(`mensaje no encontrado: ${messageKey}`)

  const m = msg.message
  const kind = m?.imageMessage
    ? { tipo: 'imagen', ext: 'jpg', buf: await downloadMediaMessage(msg, 'buffer', {}) }
    : m?.videoMessage
      ? { tipo: 'video', ext: 'mp4', buf: await downloadMediaMessage(msg, 'buffer', {}) }
      : m?.audioMessage
        ? { tipo: 'audio', ext: 'opus', buf: await downloadMediaMessage(msg, 'buffer', {}) }
        : m?.documentMessage
          ? {
              tipo: 'documento',
              ext: m.documentMessage.fileName?.split('.').pop() ?? 'bin',
              buf: await downloadMediaMessage(msg, 'buffer', {}),
            }
          : null
  if (!kind) throw new Error('el mensaje no contiene media')

  const dir = join(exportDir, chatSlug(chatName))
  mkdirSync(dir, { recursive: true })
  const tsNum = msg.messageTimestamp ? toNumber(msg.messageTimestamp) : 0
  const ts = tsNum > 0 ? new Date(tsNum * 1000) : new Date()
  const file = mediaFileName(ts, kind.tipo, kind.ext)
  const path = join(dir, file)
  writeFileSync(path, kind.buf)

  const result: DownloadResult = { messageKey, type: kind.tipo, path }
  if (kind.tipo === 'audio') {
    const t = await transcribeAudio(path, transcriber)
    result.transcription = t.transcription
    if (t.error) result.transcriptionError = t.error
  }
  return result
}
