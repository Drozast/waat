import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, mkdtempSync } from 'node:fs'
import { join, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  downloadMediaMessage,
  toNumber,
  normalizeMessageContent,
} from '@whiskeysockets/baileys'
import { chatSlug, loadAll, type ChatStore } from './chats.js'

const pExecFile = promisify(execFile)

export type Transcriber = (audioPath: string) => Promise<string>

export function defaultTranscriber(model: string, lang: string): Transcriber {
  return async (audioPath: string) => {
    // Dir temporal por llamada para no pisar la salida de otra transcripción concurrente
    const outDir = mkdtempSync(join(tmpdir(), 'waat-whisper-'))
    try {
      try {
        await pExecFile('whisper', [
          audioPath,
          '--language', lang,
          '--model', model,
          '--output_format', 'txt',
          '--output_dir', outDir,
          '--fp16', 'False',
        ])
      } catch (err) {
        // Binario ausente del PATH: error claro con hint de instalación.
        // (Lazy: whisper.cpp descarga el modelo en el primer uso, así que esto
        // solo se paga cuando de verdad hay que transcribir.)
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(
            'whisper no está instalado. Instalá whisper.cpp (p. ej. `brew install whisper-cpp`) y verificá que el binario "whisper" esté en el PATH'
          )
        }
        throw err
      }
      // whisper escribe <output_dir>/<basename sin ext>.txt
      const base = basename(audioPath).replace(/\.[^.]+$/, '')
      const txtPath = join(outDir, `${base}.txt`)
      return readFileSync(txtPath, 'utf8').trim()
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
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

// Seam de inyección para tests: reemplaza la función de descarga de Baileys.
// Devuelve la función anterior para poder restaurarla.
type MediaDownloader = typeof downloadMediaMessage
let downloader: MediaDownloader = downloadMediaMessage
export function setMediaDownloader(fn: MediaDownloader): MediaDownloader {
  const prev = downloader
  downloader = fn
  return prev
}

// Si el nombre ya existe, agrega -1, -2, ... antes de la extensión hasta encontrar uno libre
function uniquePath(dir: string, file: string): string {
  const dot = file.lastIndexOf('.')
  const stem = dot > 0 ? file.slice(0, dot) : file
  const ext = dot > 0 ? file.slice(dot) : ''
  let candidate = join(dir, file)
  let i = 1
  while (existsSync(candidate)) {
    candidate = join(dir, `${stem}-${i}${ext}`)
    i++
  }
  return candidate
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

  // Normaliza para soportar mensajes efímeros / view-once (ephemeralMessage, viewOnceMessage, ...)
  const m = normalizeMessageContent(msg.message)
  const kind = m?.imageMessage
    ? { tipo: 'imagen', ext: 'jpg', buf: await downloader(msg, 'buffer', {}) }
    : m?.videoMessage
      ? { tipo: 'video', ext: 'mp4', buf: await downloader(msg, 'buffer', {}) }
      : m?.audioMessage
        ? { tipo: 'audio', ext: 'opus', buf: await downloader(msg, 'buffer', {}) }
        : m?.documentMessage
          ? {
              tipo: 'documento',
              ext: m.documentMessage.fileName?.split('.').pop() ?? 'bin',
              buf: await downloader(msg, 'buffer', {}),
            }
          : null
  if (!kind) throw new Error('el mensaje no contiene media')

  const dir = join(exportDir, chatSlug(chatName))
  mkdirSync(dir, { recursive: true })
  const tsNum = msg.messageTimestamp ? toNumber(msg.messageTimestamp) : 0
  const ts = tsNum > 0 ? new Date(tsNum * 1000) : new Date()
  const file = mediaFileName(ts, kind.tipo, kind.ext)
  const path = uniquePath(dir, file)
  writeFileSync(path, kind.buf)

  const result: DownloadResult = { messageKey, type: kind.tipo, path }
  if (kind.tipo === 'audio') {
    const t = await transcribeAudio(path, transcriber)
    result.transcription = t.transcription
    if (t.error) result.transcriptionError = t.error
  }
  return result
}
