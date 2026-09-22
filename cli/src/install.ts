import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export interface McpEntry {
  command: string
  args: string[]
}

function stripJsonc(text: string): string {
  // quita comentarios // y /* */ para poder parsear
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,\s*([}\]])/g, '$1')
}

export function registerMcpInOpencode(cfgPath: string, entry: McpEntry): void {
  const raw = readFileSync(cfgPath, 'utf8')
  const cfg = JSON.parse(stripJsonc(raw))
  cfg.mcp = cfg.mcp ?? {}
  cfg.mcp.waat = { type: 'local', command: [entry.command, ...entry.args] }
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n')
}

export function registerMcpInClaude(cfgPath: string, entry: McpEntry): void {
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
  cfg.mcpServers = cfg.mcpServers ?? {}
  cfg.mcpServers.waat = { command: entry.command, args: entry.args }
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n')
}

export function copySkills(srcDir: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true })
  for (const f of readdirSync(srcDir)) {
    copyFileSync(join(srcDir, f), join(destDir, f))
  }
}
