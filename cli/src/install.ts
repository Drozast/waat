import { readFileSync, writeFileSync, cpSync } from 'node:fs'

export interface McpEntry {
  command: string
  args: string[]
}

// Quita comentarios de línea (//) y de bloque (/* ... */) y trailing
// commas de un JSONC, sin tocar lo que está dentro de strings: un // o
// /* ... */ dentro de un "..." (p. ej. una URL) no se toca.
export function stripJsonc(text: string): string {
  let out = ''
  let inString = false
  let inLineComment = false
  let inBlockComment = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    const next = text[i + 1]
    if (inLineComment) {
      if (c === '\n') {
        inLineComment = false
        out += c
      }
      continue
    }
    if (inBlockComment) {
      if (c === '*' && next === '/') {
        inBlockComment = false
        i++
      }
      continue
    }
    if (inString) {
      out += c
      if (c === '\\') {
        // copia el carácter escapado tal cual (\" \\ etc.)
        if (next !== undefined) {
          out += next
          i++
        }
      } else if (c === '"') {
        inString = false
      }
      continue
    }
    // fuera de string y de comentario
    if (c === '"') {
      inString = true
      out += c
      continue
    }
    if (c === '/' && next === '/') {
      inLineComment = true
      i++
      continue
    }
    if (c === '/' && next === '*') {
      inBlockComment = true
      i++
      continue
    }
    if (c === ',') {
      // trailing comma: , seguido (ignorando espacios) de } o ]
      let j = i + 1
      while (j < text.length && /\s/.test(text[j])) j++
      if (text[j] === '}' || text[j] === ']') continue
    }
    out += c
  }
  return out
}

export function registerMcpInOpencode(cfgPath: string, entry: McpEntry): void {
  const raw = readFileSync(cfgPath, 'utf8')
  let cfg: any
  try {
    cfg = JSON.parse(stripJsonc(raw))
  } catch (e) {
    throw new Error(`no se pudo parsear ${cfgPath}: ${(e as Error).message}`)
  }
  cfg.mcp = cfg.mcp ?? {}
  cfg.mcp.waat = { type: 'local', command: [entry.command, ...entry.args] }
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n')
}

export function registerMcpInClaude(cfgPath: string, entry: McpEntry): void {
  let cfg: any
  try {
    cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
  } catch (e) {
    throw new Error(`no se pudo parsear ${cfgPath}: ${(e as Error).message}`)
  }
  cfg.mcpServers = cfg.mcpServers ?? {}
  cfg.mcpServers.waat = { command: entry.command, args: entry.args }
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n')
}

export function copySkills(srcDir: string, destDir: string): void {
  cpSync(srcDir, destDir, { recursive: true })
}
