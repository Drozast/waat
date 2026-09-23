import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface EnsureDaemonOptions {
  waatDir: string
  port: number
  /** Ruta al daemon/dist/index.js (resuelta por el llamador) */
  daemonJs: string
  /** Máximo tiempo de espera hasta que el daemon responda (default 15000ms) */
  timeoutMs?: number
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EPERM') return true // vive, otro usuario
    return false
  }
}

async function isUp(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

function spawnDaemon(opts: EnsureDaemonOptions): void {
  const lockPath = join(opts.waatDir, 'daemon.lock')
  mkdirSync(opts.waatDir, { recursive: true })
  const out = openSync(join(opts.waatDir, 'daemon-out.log'), 'a')
  const err = openSync(join(opts.waatDir, 'daemon-err.log'), 'a')
  const child = spawn(process.execPath, [opts.daemonJs], {
    detached: true,
    stdio: ['ignore', out, err],
    env: { ...process.env, WAAT_DIR: opts.waatDir, WAAT_PORT: String(opts.port) },
  })
  child.unref()
  writeFileSync(lockPath, String(child.pid))
}

/**
 * Si el daemon no responde, lo arranca (mismo patrón de lock que `waat start`)
 * y espera a que /health responda. Devuelve true si al final está arriba.
 * Nunca lanza: si no se pudo arrancar, devuelve false y la tool reporta offline.
 */
export async function ensureDaemon(opts: EnsureDaemonOptions): Promise<boolean> {
  const baseUrl = `http://127.0.0.1:${opts.port}`
  const timeoutMs = opts.timeoutMs ?? 15000
  const deadline = Date.now() + timeoutMs

  if (await isUp(baseUrl)) return true

  // Lock stale: el PID ya no existe → limpiar antes de spawnear
  const lockPath = join(opts.waatDir, 'daemon.lock')
  if (existsSync(lockPath)) {
    const pid = Number(readFileSync(lockPath, 'utf8').trim())
    if (!(pid > 0) || !pidAlive(pid)) {
      try {
        unlinkSync(lockPath)
      } catch {
        /* ya no existe */
      }
    }
  }

  if (!existsSync(opts.daemonJs)) return false
  try {
    spawnDaemon(opts)
  } catch {
    return false
  }

  while (Date.now() < deadline) {
    if (await isUp(baseUrl)) return true
    await new Promise((r) => setTimeout(r, 300))
  }
  return isUp(baseUrl)
}
