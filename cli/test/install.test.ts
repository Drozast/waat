import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerMcpInOpencode, registerMcpInClaude, copySkills } from '../src/install.js'

test('registerMcpInOpencode agrega el server al jsonc', () => {
  const dir = mkdtempSync(join(tmpdir(), 'waat-cli-'))
  const cfgPath = join(dir, 'opencode.jsonc')
  writeFileSync(cfgPath, '{\n  "$schema": "https://opencode.ai/config.json"\n}\n')
  registerMcpInOpencode(cfgPath, { command: 'node', args: ['/opt/waat/mcp/dist/index.js'] })
  const content = readFileSync(cfgPath, 'utf8')
  assert.ok(content.includes('waat'))
  assert.ok(content.includes('/opt/waat/mcp/dist/index.js'))
})

test('registerMcpInClaude agrega al .claude.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'waat-cli-'))
  const cfgPath = join(dir, '.claude.json')
  writeFileSync(cfgPath, JSON.stringify({ mcpServers: {} }))
  registerMcpInClaude(cfgPath, { command: 'node', args: ['/opt/waat/mcp/dist/index.js'] })
  const content = JSON.parse(readFileSync(cfgPath, 'utf8'))
  assert.ok(content.mcpServers.waat)
  assert.equal(content.mcpServers.waat.command, 'node')
})

test('copySkills copia skills a destino', () => {
  const src = mkdtempSync(join(tmpdir(), 'waat-skills-src-'))
  const dest = mkdtempSync(join(tmpdir(), 'waat-skills-dest-'))
  writeFileSync(join(src, 'SKILL.md'), '# test skill')
  copySkills(src, dest)
  assert.ok(existsSync(join(dest, 'SKILL.md')))
})
