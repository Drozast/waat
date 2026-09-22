import type { WaatClient, WaatResponse } from './client.js'

export function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  client: WaatClient
): Promise<WaatResponse> {
  switch (name) {
    case 'waat_status': return client.status()
    case 'waat_link': return client.link()
    case 'waat_list_chats': return client.listChats(args.q as string | undefined)
    case 'waat_read_chat':
      return client.readChat(args.chatId as string, args.limit as number | undefined, args.before as string | undefined)
    case 'waat_search': return client.search(args.q as string, args.chatId as string | undefined)
    case 'waat_download_media':
      return client.downloadMedia(args.chatId as string, args.messageKey as string)
    case 'waat_send_text': return client.sendText(args.chatId as string, args.text as string)
    case 'waat_send_media':
      return client.sendMedia(args.chatId as string, args.filePath as string, args.caption as string | undefined, args.ptt as boolean | undefined)
    default:
      return Promise.resolve({ ok: false, error: `tool desconocida: ${name}` })
  }
}
