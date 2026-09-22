import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerMcpInOpencode, registerMcpInClaude, copySkills, stripJsonc } from '../src/install.js'

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

test('stripJsonc: comentario // inline se quita y el json parsea', () => {
  const src = '{\n  "url": "https://x.com", // nota\n  "a": 1\n}\n'
  const parsed = JSON.parse(stripJsonc(src))
  assert.equal(parsed.url, 'https://x.com')
  assert.equal(parsed.a, 1)
})

test('stripJsonc: /* */ dentro de un string NO se corrompe', () => {
  const src = '{\n  "url": "https://x.com/a/*b*/c"\n}\n'
  const parsed = JSON.parse(stripJsonc(src))
  assert.equal(parsed.url, 'https://x.com/a/*b*/c')
})

test('stripJsonc: trailing comma se quita y el json parsea', () => {
  const src = '{\n  "a": 1,\n  "b": [1, 2,],\n}\n'
  const parsed = JSON.parse(stripJsonc(src))
  assert.equal(parsed.a, 1)
  assert.deepEqual(parsed.b, [1, 2])
})

test('stripJsonc: // dentro de un string (URL) NO se corrompe', () => {
  const src = '{\n  "schema": "https://opencode.ai/config.json"\n}\n'
  const parsed = JSON.parse(stripJsonc(src))
  assert.equal(parsed.schema, 'https://opencode.ai/config.json')
})

test('stripJsonc: coma dentro de un string antes de } NO se toca', () => {
  const src = '{\n  "a": "x,}",\n  "b": 2\n}\n'
  const parsed = JSON.parse(stripJsonc(src))
  assert.equal(parsed.a, 'x,}')
  assert.equal(parsed.b, 2)
})
