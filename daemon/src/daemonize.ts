import { openSync, closeSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'

/**
 * Lock file simple: escribe el PID; si el PID ya no existe, el lock es stale
 * y se toma. Devuelve una función de release o null si otro proceso lo tiene.
 */
export function acquireLock(lockPath: string): (() => void) | null {
  if (existsSync(lockPath)) {
    const pid = Number(readFileSync(lockPath, 'utf8').trim())
    if (pid > 0) {
      try {
        process.kill(pid, 0) // si no lanza, el proceso vive
        return null
      } catch {
        // stale lock: se reemplaza
      }
    }
  }
  const fd = openSync(lockPath, 'w')
  writeFileSync(lockPath, String(process.pid))
  closeSync(fd)
  return () => {
    try {
      unlinkSync(lockPath)
    } catch {
      /* ya no existe */
    }
  }
}

export function releaseLock(lockPath: string): void {
  try {
    unlinkSync(lockPath)
  } catch {
    /* ya no existe */
  }
}

export interface PlistParams {
  label: string
  program: string
  args: string[]
  stdout: string
  stderr: string
}

export function renderLaunchdPlist(p: PlistParams): string {
  const args = [p.program, ...p.args].map((a) => `      <string>${a}</string>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${p.label}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${p.stdout}</string>
  <key>StandardErrorPath</key>
  <string>${p.stderr}</string>
</dict>
</plist>
`
}
