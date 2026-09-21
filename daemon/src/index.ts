import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { WaClient } from './wa.js'
import { createServer } from './server.js'

const WAAT_DIR = process.env.WAAT_DIR ?? join(homedir(), '.waat')
const portRaw = process.env.WAAT_PORT
const PORT = portRaw ? Number(portRaw) : 8787
if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) {
  console.error(`[waat] WAAT_PORT inválido: ${portRaw}`)
  process.exit(1)
}
const HOST = process.env.WAAT_HOST ?? '127.0.0.1'

mkdirSync(WAAT_DIR, { recursive: true })
const tokenPath = join(WAAT_DIR, 'token')
const existingToken = existsSync(tokenPath) ? readFileSync(tokenPath, 'utf8').trim() : undefined

const wa = new WaClient({
  authDir: join(WAAT_DIR, 'auth'),
  onQr: (_qr, png) =>
    console.log(`[waat] QR guardado en ${png} — escanéalo con WhatsApp > Dispositivos vinculados`),
})

const handle = await createServer({
  wa,
  port: PORT,
  host: HOST,
  token: existingToken,
  exportDir: process.env.WAAT_EXPORT_DIR ?? join(homedir(), 'waat'),
  whisperModel: process.env.WAAT_WHISPER_MODEL ?? 'small',
  whisperLang: process.env.WAAT_WHISPER_LANG ?? 'Spanish',
})
if (!existingToken) writeFileSync(tokenPath, handle.token, { mode: 0o600 })
console.log(`[waat] daemon listo en ${handle.url}`)

await wa.start() // si hay sesión guardada entra directo; si no, queda en linking con QR

process.on('SIGTERM', async () => {
  await wa.stop()
  process.exit(0)
})
process.on('SIGINT', async () => {
  await wa.stop()
  process.exit(0)
})
