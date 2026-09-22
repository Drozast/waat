<p align="center">
  <img src="docs/demo.gif" alt="demo" width="420"/>
</p>

# waat — WhatsApp Agent Toolkit

Vincula tu WhatsApp **una vez** y deja que tus agentes de código (opencode, Claude Code, o cualquier cliente MCP) lean conversaciones, descarguen imágenes/audios/videos y envíen mensajes. Sin copiar y pegar.

- 🔗 Vinculación única por QR — la sesión persiste en `~/.waat/`
- 📥 Descarga de media a `~/waat/<chat>/` con transcripción automática de audios (Whisper local)
- 📤 Envío de texto y media (imágenes, audios, videos, archivos)
- 🤖 MCP server: funciona en opencode, Claude Code y cualquier cliente MCP
- 🔒 Todo local: daemon en `localhost:8787`, nada pasa por la nube

## Quickstart

```bash
npx waat install   # registra MCP + skills en opencode y Claude Code
npx waat start     # inicia el daemon
npx waat link      # escanea el QR con WhatsApp
```

Listo: "leeme el chat con Juan y sacame los acuerdos" — tu agente hace el resto.

## Cómo funciona

```
opencode / Claude Code
        │ MCP (stdio)
        ▼
  MCP adapter (delgado)
        │ HTTP localhost:8787
        ▼
  waat daemon (Baileys) ──► WhatsApp
```

Una sola conexión aunque uses varias herramientas a la vez.

## Tools

| Tool | Descripción |
|---|---|
| `waat_status` | estado de la conexión |
| `waat_link` | QR de vinculación |
| `waat_list_chats` | listar conversaciones |
| `waat_read_chat` | leer mensajes (paginado) |
| `waat_search` | buscar en mensajes |
| `waat_download_media` | descargar media + transcribir audios |
| `waat_send_text` | enviar texto |
| `waat_send_media` | enviar media |

## Requisitos

- Node 22+
- (opcional, para transcripción) [whisper](https://github.com/openai/whisper) local

## Desarrollo

```bash
git clone https://github.com/Drozast/waat
cd waat && npm install && npm run build && npm test
```

Ver `docs/TESTING.md` para el E2E manual.

## Licencia

MIT — ver [LICENSE](LICENSE).
