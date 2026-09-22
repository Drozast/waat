#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { registerMcpInOpencode, registerMcpInClaude, copySkills } from './install.js'

const WAAT_DIR = process.env.WAAT_DIR ?? join(homedir(), '.waat')
const PORT = process.env.WAAT_PORT ?? '8787'
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..')
const MCP_BIN = join(ROOT, 'mcp', 'dist', 'index.js')
const SKILLS_DIR = join(ROOT, 'skills')

function die(msg: string): never {
  console.error(`[waat] ${msg}`)
  process.exit(1)
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
  return res.json()
}

function cmdStatus(): void {
  api('/status')
    .then((b) => console.log(JSON.stringify(b, null, 2)))
    .catch(() => die('daemon no responde. Corré: npx waat start'))
}

function cmdLink(): void {
  api('/link', 'POST')
    .then((b) => {
      if (b.ok) {
        console.log(`[waat] QR en ${b.data.qr}`)
        console.log('[waat] Escanealo con WhatsApp > Ajustes > Dispositivos vinculados')
      } else die(b.error)
    })
    .catch(() => die('daemon no responde. Corré: npx waat start'))
}

function cmdStart(): void {
  const lockPath = join(WAAT_DIR, 'daemon.lock')
  if (existsSync(lockPath)) {
    const pid = Number(readFileSync(lockPath, 'utf8').trim())
    try {
      process.kill(pid, 0)
      die(`daemon ya corriendo (pid ${pid})`)
    } catch {
      /* stale */
    }
  }
  mkdirSync(WAAT_DIR, { recursive: true })
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
  process.kill(pid, 'SIGTERM')
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
  console.log('[waat] listo. Corré: npx waat link')
}

const cmd = process.argv[2]
switch (cmd) {
  case 'status': cmdStatus(); break
  case 'link': cmdLink(); break
  case 'start': cmdStart(); break
  case 'stop': cmdStop(); break
  case 'install': cmdInstall(); break
  default:
    console.log(`waat — WhatsApp Agent Toolkit
Uso:
  waat install   registra MCP + skills en opencode y Claude Code
  waat start     inicia el daemon
  waat stop      detiene el daemon
  waat link      muestra el QR para vincular WhatsApp
  waat status    estado de la conexión`)
}
