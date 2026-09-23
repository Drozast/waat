#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync, closeSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { registerMcpInOpencode, registerMcpInClaude, copySkills } from './install.js'

const WAAT_DIR = process.env.WAAT_DIR ?? join(homedir(), '.waat')
const PORT = process.env.WAAT_PORT ?? '8787'
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
const MCP_BIN = join(ROOT, 'mcp', 'dist', 'index.js')
const SKILLS_DIR = join(ROOT, 'skills')
// Path real de este CLI: los hints lo usan para que funcionen con cualquier
// método de instalación (npm, curl|bash o git), sin depender de `npx waat`.
const CLI_BIN = fileURLToPath(import.meta.url)

function die(msg: string): never {
  console.error(`[waat] ${msg}`)
  process.exit(1)
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

async function daemonUrl(): Promise<string> {
  return `http://127.0.0.1:${PORT}`
}

async function api(path: string, method = 'GET'): Promise<any> {
  const tokenPath = join(WAAT_DIR, 'token')
  const token = existsSync(tokenPath) ? readFileSync(tokenPath, 'utf8').trim() : ''
  const res = await fetch(`${await daemonUrl()}${path}`, {
    method,
    headers: { 'x-waat-token': token, 'content-type': 'application/json' },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = body && typeof body === 'object' && 'error' in body ? String((body as any).error) : `HTTP ${res.status}`
    throw new Error(`el daemon respondió con error: ${msg}`)
  }
  if (body === null) {
    throw new Error(`respuesta inválida del daemon (HTTP ${res.status})`)
  }
  return body
}

function cmdStatus(): void {
  api('/status')
    .then((b) => console.log(JSON.stringify(b, null, 2)))
    .catch((e) => {
      const detail = e instanceof Error ? e.message : String(e)
      die(`daemon no responde (${detail}). Arrancalo con: node ${CLI_BIN} start`)
    })
}

function cmdLink(): void {
  api('/link', 'POST')
    .then((b) => {
      if (b.ok) {
        console.log(`[waat] QR en ${b.data.qr}`)
        console.log('[waat] Escanealo con WhatsApp > Ajustes > Dispositivos vinculados')
      } else die(b.error)
    })
    .catch((e) => die(e instanceof Error ? e.message : `daemon no responde. Corré: node ${CLI_BIN} start`))
}

function cmdStart(): void {
  const lockPath = join(WAAT_DIR, 'daemon.lock')
  mkdirSync(WAAT_DIR, { recursive: true })
  // adquisición atómica (O_EXCL), mismo patrón que el daemon
  for (;;) {
    try {
      const fd = openSync(lockPath, 'wx')
      closeSync(fd)
      break
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
      const pid = Number(readFileSync(lockPath, 'utf8').trim())
      if (pid > 0 && pidAlive(pid)) die(`daemon ya corriendo (pid ${pid})`)
      try {
        unlinkSync(lockPath)
      } catch {
        /* lost the race on unlink; retry */
      }
    }
  }
  const daemonJs = join(ROOT, 'daemon', 'dist', 'index.js')
  const child = spawn(process.execPath, [daemonJs], {
    detached: true,
    stdio: ['ignore', openLog('out'), openLog('err')],
    env: { ...process.env, WAAT_DIR, WAAT_PORT: PORT },
  })
  child.unref()
  writeFileSync(lockPath, String(child.pid))
  console.log(`[waat] daemon iniciado (pid ${child.pid})`)
}

function openLog(kind: string): number {
  const p = join(WAAT_DIR, `daemon-${kind}.log`)
  return openSync(p, 'a')
}

function cmdStop(): void {
  const lockPath = join(WAAT_DIR, 'daemon.lock')
  if (!existsSync(lockPath)) die('daemon no corriendo')
  const pid = Number(readFileSync(lockPath, 'utf8').trim())
  if (!(pid > 0) || !pidAlive(pid)) {
    try {
      unlinkSync(lockPath)
    } catch {
      /* ya no existe */
    }
    console.log('[waat] daemon no corriendo (lock stale, limpiado)')
    return
  }
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    try {
      unlinkSync(lockPath)
    } catch {
      /* ya no existe */
    }
    console.log('[waat] daemon no corriendo (lock stale, limpiado)')
    return
  }
  try {
    unlinkSync(lockPath)
  } catch {
    /* ya no existe */
  }
  console.log(`[waat] daemon detenido (pid ${pid})`)
}

function cmdInstall(): void {
  const node = process.execPath
  const entry = { command: node, args: [MCP_BIN] }

  const opencodeCfg = join(homedir(), '.config', 'opencode', 'opencode.jsonc')
  if (existsSync(opencodeCfg)) {
    registerMcpInOpencode(opencodeCfg, entry)
    console.log(`[waat] MCP registrado en opencode (${opencodeCfg})`)
  }

  const claudeCfg = join(homedir(), '.claude.json')
  if (existsSync(claudeCfg)) {
    registerMcpInClaude(claudeCfg, entry)
    console.log(`[waat] MCP registrado en Claude Code (${claudeCfg})`)
  }

  const skillsSrc = SKILLS_DIR
  if (existsSync(skillsSrc)) {
    for (const target of ['opencode', 'claude-code']) {
      const src = join(skillsSrc, target)
      const dest =
        target === 'opencode'
          ? join(homedir(), '.config', 'opencode', 'skills', 'waat')
          : join(homedir(), '.claude', 'skills', 'waat')
      copySkills(src, dest)
      console.log(`[waat] skill copiada a ${dest}`)
    }
  }
  console.log(`[waat] listo. Corré: node ${CLI_BIN} link`)
}

function printUsage(): void {
  console.log(`waat — WhatsApp Agent Toolkit
Uso:
  waat            estado de la conexión (sin args)
  waat install    registra MCP + skills en opencode y Claude Code
  waat start      inicia el daemon
  waat stop       detiene el daemon
  waat link       muestra el QR para vincular WhatsApp
  waat status     estado de la conexión
  waat help       esta ayuda`)
}

const cmd = process.argv[2]
switch (cmd) {
  case 'status': cmdStatus(); break
  case 'link': cmdLink(); break
  case 'start': cmdStart(); break
  case 'stop': cmdStop(); break
  case 'install': cmdInstall(); break
  case 'help':
  case '--help':
  case '-h':
    printUsage()
    break
  default:
    if (cmd === undefined) {
      // Flujo simplificado: sin args = status
      cmdStatus()
    } else {
      console.error(`[waat] comando desconocido: ${cmd}`)
      printUsage()
      process.exit(1)
    }
}
