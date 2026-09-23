# waat — WhatsApp Agent Toolkit

Vincula tu WhatsApp **una vez** y deja que tus agentes de código (opencode, Claude Code, o cualquier cliente MCP) lean conversaciones, descarguen imágenes/audios/videos y envíen mensajes. Sin copiar y pegar.

- 🔗 Vinculación única por QR — la sesión persiste en `~/.waat/`
- 📥 Descarga de media a `~/waat/<chat>/` con transcripción automática de audios (Whisper local)
- 📤 Envío de texto y media (imágenes, audios, videos, archivos)
- 🤖 MCP server: funciona en opencode, Claude Code y cualquier cliente MCP
- 🔒 Todo local: daemon en `localhost:8787`, nada pasa por la nube

## Instalación

### Opción 1 — un solo comando (recomendada)

```bash
curl -fsSL https://raw.githubusercontent.com/Drozast/waat/main/install.sh | bash
```

Clona el repo a `~/.waat-src`, compila y registra el MCP + skills en opencode y
Claude Code. Después vinculá WhatsApp una vez:

```bash
node ~/.waat-src/cli/dist/index.js link   # escanea el QR con WhatsApp
```

Para actualizar más tarde, repetí el mismo `curl | bash` (hace `git pull` + build).

### Opción 2 — npm

```bash
npx waat install   # registra MCP + skills en opencode y Claude Code
npx waat link      # escanea el QR con WhatsApp (una vez)
```

### Opción 3 — desde git

```bash
git clone https://github.com/Drozast/waat
cd waat && npm install && npm run build
node cli/dist/index.js install
node cli/dist/index.js link
```

El daemon se arranca solo la primera vez que tu agente usa una tool `waat_*`
(auto-spawn). Si preferís arrancarlo a mano: `npx waat start`.

Listo: "leeme el chat con Juan y sacame los acuerdos" — tu agente hace el resto.

### Uso en tu agente

- **opencode** y **Claude Code** ya detectan el MCP y la skill automáticamente.
- Pedí: *"leeme el chat con Juan"*, *"buscá 'factura' en WhatsApp"*,
  *"descargá el audio de María y resumilo"*, *"mandale a Pedro: voy en 10"*.
- El agente verifica `waat_status`; si está `offline`, te pide que corras el
  comando `link` que te mostró la instalación (p. ej.
  `node ~/.waat-src/cli/dist/index.js link`) y escanees el QR.

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
- (opcional, para transcripción de audios) [whisper.cpp](https://github.com/ggml-org/whisper.cpp) — `brew install whisper-cpp`

## Desarrollo

```bash
git clone https://github.com/Drozast/waat
cd waat && npm install && npm run build && npm test
```

Ver `docs/TESTING.md` para el E2E manual.

## Licencia

MIT — ver [LICENSE](LICENSE).
