import { openSync, closeSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EPERM') return true // vive, otro usuario
    return false
  }
}

/**
 * Lock file simple: escribe el PID; si el PID ya no existe, el lock es stale
 * y se toma. La adquisición es atómica (O_EXCL). Devuelve una función de
 * release o null si otro proceso lo tiene.
 */
export function acquireLock(lockPath: string): (() => void) | null {
  for (;;) {
    try {
      const fd = openSync(lockPath, 'wx')
      writeFileSync(fd, String(process.pid))
      closeSync(fd)
      return () => {
        try {
          unlinkSync(lockPath)
        } catch {
          /* ya no existe */
        }
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
      const pid = Number(readFileSync(lockPath, 'utf8').trim())
      if (pid > 0 && pidAlive(pid)) return null
      try {
        unlinkSync(lockPath)
      } catch {
        /* lost the race on unlink; retry */
      }
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

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderLaunchdPlist(p: PlistParams): string {
  const args = [p.program, ...p.args].map((a) => `      <string>${escapeXml(a)}</string>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(p.label)}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(p.stdout)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(p.stderr)}</string>
</dict>
</plist>
`
}
