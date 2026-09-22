# E2E manual de waat

Requiere: Node 22, `whisper` instalado, WhatsApp en el teléfono.

1. `npm run build && npm test` — CI verde.
2. `node cli/dist/index.js start` — daemon arranca.
3. `node cli/dist/index.js link` — escanear QR con WhatsApp > Dispositivos vinculados.
4. `node cli/dist/index.js status` — `state: online`, `chatCount > 0`.
5. Con opencode o Claude Code: "listame mis chats de whatsapp" → usa `waat_list_chats`.
6. "leeme la conversación con <nombre>" → `waat_read_chat`.
7. "descargá la última imagen de ese chat" → `waat_download_media`; verificar archivo en `~/waat/<chat>/`.
8. "transcribí el último audio" → el tool ya lo transcribe; verificar `.txt` junto al audio.
9. "enviale a <nombre> un texto que dice hola" → confirmar → `waat_send_text`.
10. `node cli/dist/index.js stop` — daemon se detiene.
