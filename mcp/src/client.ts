export interface WaatClientOptions {
  baseUrl: string
  token: string
}

export interface WaatResponse {
  ok: boolean
  data?: unknown
  error?: string
  hint?: string
}

export class WaatClient {
  private baseUrl: string
  private token: string

  constructor(opts: WaatClientOptions) {
    this.baseUrl = opts.baseUrl
    this.token = opts.token
  }

  async request(method: string, path: string, body?: unknown): Promise<WaatResponse> {
    let res: Response
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-waat-token': this.token,
        },
        body: body ? JSON.stringify(body) : undefined,
      })
    } catch {
      return { ok: false, error: 'offline', hint: 'run: npx waat link' }
    }
    const json = (await res.json().catch(() => ({}))) as WaatResponse
    if (!json.ok && res.status === 503) {
      return { ok: false, error: 'offline', hint: 'run: npx waat link' }
    }
    return json
  }

  health(): Promise<WaatResponse> {
    return this.request('GET', '/health')
  }

  status(): Promise<WaatResponse> {
    return this.request('GET', '/status')
  }

  link(): Promise<WaatResponse> {
    return this.request('POST', '/link')
  }

  listChats(q?: string): Promise<WaatResponse> {
    return this.request('GET', q ? `/chats?q=${encodeURIComponent(q)}` : '/chats')
  }

  readChat(chatId: string, limit?: number, before?: string): Promise<WaatResponse> {
    const params = new URLSearchParams()
    if (limit) params.set('limit', String(limit))
    if (before) params.set('before', before)
    const qs = params.toString()
    return this.request('GET', `/chats/${encodeURIComponent(chatId)}/messages${qs ? `?${qs}` : ''}`)
  }

  search(q: string, chatId?: string): Promise<WaatResponse> {
    const params = new URLSearchParams({ q })
    if (chatId) params.set('chat', chatId)
    return this.request('GET', `/search?${params.toString()}`)
  }

  downloadMedia(chatId: string, messageKey: string): Promise<WaatResponse> {
    return this.request('POST', '/media/download', { chatId, messageKey })
  }

  sendText(chatId: string, text: string): Promise<WaatResponse> {
    return this.request('POST', '/send/text', { chatId, text })
  }

  sendMedia(chatId: string, filePath: string, caption?: string, ptt?: boolean): Promise<WaatResponse> {
    return this.request('POST', '/send/media', { chatId, filePath, caption, ptt })
  }
}
