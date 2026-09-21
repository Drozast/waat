# waat — WhatsApp Agent Toolkit (diseño)

Fecha: 2026-09-21
Estado: aprobado por el usuario (sesión de brainstorming)

## Resumen

`waat` es una herramienta open-source que vincula una cuenta de WhatsApp una vez
(vía QR) y permite a agentes de código (opencode, Claude Code, y cualquier cliente
MCP) listar conversaciones, leer mensajes, buscar, descargar media
(imágenes, audios, videos) y enviar mensajes de texto y media — sin copiar y
pegar nada.

- Nombre: **waat** (WhatsApp Agent Toolkit)
- Repo público en GitHub (usuario: Drozast), licencia MIT
- Instalación: `npx waat install` / `npx waat link`
- Idioma de implementación: TypeScript, Node 22
- Conexión: Baileys (librería Node no-oficial para WhatsApp Web)

## Decisiones de diseño (aprobadas)

| Decisión | Elección | Motivo |
|---|---|---|
| Método de conexión | Baileys (Node) | API limpia, sesión persistente en disco, descarga de media confiable |
| Alcance de operaciones | Lectura + envío (texto y media) | El usuario envía y recibe; Baileys soporta ambos |
| Manejo de media | Carpeta por chat + transcripción automática Whisper local | El agente recibe rutas + texto sin pasos manuales |
| Arquitectura de proceso | Daemon HTTP + MCP adapter delgado | Una sola conexión aunque corran varias herramientas a la vez |
| Ubicación | `~/Projects/waat` + skills en cada herramienta | Repo mantenible, versionable, público |
| Nombre | waat | Corto, memorable, disponible |
| Visibilidad | Repo pulido + npm + awesome lists + perfil GitHub | Contribuir a la comunidad y posicionarse |

## Arquitectura

```
┌─────────────┐     ┌─────────────┐
│  opencode   │     │ Claude Code │
│  (MCP)      │     │ (MCP)       │
└──────┬──────┘     └──────┬──────┘
       │ stdio             │ stdio
       ▼                   ▼
┌──────────────────────────────────┐
│  MCP adapter (delgado)           │  ← lo arranca cada herramienta
└──────────────┬───────────────────┘
               │ HTTP localhost:8787
               ▼
┌──────────────────────────────────┐
│  waat daemon (Node + Baileys)    │  ← conexión WhatsApp persistente
│  · auth state en ~/.waat/auth    │     (launchd, auto-start)
│  · API HTTP local                │
│  · descarga media → ~/waat/     │
│  · transcripción Whisper (audio) │
└──────────────┬───────────────────┘
               ▼
        WhatsApp (cuenta del usuario)
```

Reglas:

- Una sola conexión WhatsApp aunque corran varias herramientas a la vez.
- El daemon se vincula una vez por QR (`npx waat link`); la sesión persiste en
  `~/.waat/auth/` (fuera del repo, nunca se commitea).
- Si el daemon no está corriendo, el MCP adapter lo spawnea y espera a que
  responda a `GET /health` (timeout 15s). Para evitar que dos herramientas
  spawneen a la vez, el spawn usa un lock file (`~/.waat/daemon.lock`): quien
  no puede tomar el lock solo espera al `GET /health`.
- El daemon se registra como servicio launchd (macOS) para auto-start; en
  Linux, systemd unit opcional.
- Configuración por variables de entorno: `WAAT_PORT` (default 8787),
  `WAAT_EXPORT_DIR` (default `~/waat`), `WAAT_WHISPER_MODEL` (default `small`),
  `WAAT_WHISPER_LANG` (default `Spanish`), `WAAT_HOST` (default 127.0.0.1).

## Estructura del repo

```
waat/
├── package.json            # npm workspaces: daemon + mcp; bin: waat
├── daemon/
│   └── src/
│       ├── server.ts       # API HTTP (solo localhost)
│       ├── wa.ts           # conexión Baileys, auth state, QR
│       ├── chats.ts        # listar / leer / buscar
│       ├── media.ts        # descarga de media + transcripción
│       └── send.ts         # envío de texto y media
├── mcp/
│   └── src/index.ts        # MCP server stdio → proxy HTTP al daemon
├── cli/
│   └── src/index.ts        # bin `waat`: install, link, status, start, stop
├── skills/
│   ├── opencode/SKILL.md
│   └── claude-code/SKILL.md
├── install.sh              # registro MCP + skills (usado por `waat install`)
├── README.md               # demo GIF, quickstart, badges
├── CONTRIBUTING.md
├── LICENSE                 # MIT
└── docs/
    ├── TESTING.md          # E2E manual con chat real
    └── superpowers/specs/  # este documento
```

## Tools MCP y API HTTP

El MCP adapter expone estas tools (1:1 con endpoints HTTP del daemon):

| Tool | Endpoint | Descripción |
|---|---|---|
| `waat_status` | `GET /status` | online/offline, sesión activa, nº de chats, versión |
| `waat_link` | `POST /link` | genera QR; devuelve ruta PNG (`~/.waat/qr.png`) y QR ASCII |
| `waat_list_chats` | `GET /chats?q=` | chats con nombre, último mensaje, unread; filtro por texto |
| `waat_read_chat` | `GET /chats/:id/messages?before=&limit=` | mensajes paginados, cursor por ID de mensaje |
| `waat_search` | `GET /search?q=&chat=` | búsqueda de texto en un chat o en todos |
| `waat_download_media` | `POST /media/download` | descarga media de un mensaje o rango → `~/waat/<chat-slug>/` |
| `waat_send_text` | `POST /send/text` | envía texto a un chat |
| `waat_send_media` | `POST /send/media` | envía imagen/audio/video/archivo desde ruta local |

Formato de mensajes para el LLM (compacto, legible):

```
2026-09-20 14:32 | Juan: hola, te adjunto el contrato
2026-09-20 14:33 | Juan: [imagen] ~/waat/juan/2026-09-20T14-33-01-image.jpg
2026-09-20 14:35 | Tú: perfecto, lo reviso
2026-09-20 14:36 | Juan: [audio] ~/waat/juan/2026-09-20T14-36-02-audio.opus
  transcripción: "el pago se hace el viernes, no el lunes"
```

Reglas de uso (definidas en las skills, no en el código):

- Antes de `waat_send_*`, el agente muestra al usuario qué va a enviar y a qué
  chat, y espera confirmación (salvo que el usuario ya haya pedido el envío).
- Para "revisar una conversación", el flujo es: `waat_list_chats` →
  `waat_read_chat` → `waat_download_media` si hay media relevante.

## Media y transcripción

- Descarga a `~/waat/<chat-slug>/<YYYY-MM-DDTHH-MM-SS>-<tipo>.<ext>`
  (nombres estables, sin colisiones; `chat-slug` = nombre del chat normalizado).
- Audio: transcripción automática con Whisper local
  (`whisper --model small --language Spanish`), el `.txt` queda junto al audio
  y la transcripción se incluye inline en la respuesta del tool.
- Imágenes: el tool devuelve la ruta; el agente lee la imagen directamente.
- Video: se descarga; extracción de frames/audio queda fuera de scope v1.
- Si Whisper falla, el tool devuelve la ruta del audio + el error; no rompe la
  respuesta del batch.
- La transcripción corre en background (cola simple, 1 a la vez) para no
  bloquear el HTTP; el tool espera hasta 60s y si no termina devuelve la ruta
  con `transcripción: pendiente`.

## Distribución y visibilidad

- GitHub: repo `waat` público (usuario Drozast), README con GIF demo
  (agente leyendo un chat real y extrayendo info), badges (npm version,
  license, node), quickstart de 3 líneas.
- npm: paquete `waat` con bin; `npx waat install` y `npx waat link` sin
  clonar nada.
- Comunidad: submit a *awesome-mcp-servers*, post en X/LinkedIn con el demo,
  la skill existente `transcribir-audio` enlaza a waat.
- Contribuciones: `CONTRIBUTING.md` y labels `good first issue` desde el
  primer release.

## Fase final: pulido de GitHub (repo + perfil)

Con `gh` CLI autenticado como Drozast (scope `repo`), sin necesidad de
Playwright:

1. Repo `waat` impecable: README con demo, estructura limpia, LICENSE,
   .gitignore, issues de `good first issue`.
2. Perfil GitHub (usuario Drozast):
   - README de perfil (repo `Drozast/Drozast`): presentación, stack, repos
     destacados.
   - Fijar `waat` como repo pinned.
   - Revisar bio y links del perfil.
- Si alguna operación de perfil no está disponible vía `gh`/API, se guía al
  usuario paso a paso (o se usa Playwright como plan B).

## Manejo de errores

- Daemon offline: cualquier tool devuelve
  `{ok:false, error:"offline", hint:"run: npx waat link"}`.
- QR vencido: `waat_link` regenera un QR nuevo.
- Media fallida/corrupta: se reporta por mensaje dentro del batch; el resto
  se procesa.
- WhatsApp desconecta la sesión (reinicio de teléfono, etc.): el daemon
  expone `status: needs_relink` y el tool `waat_link` vuelve a mostrar QR.
- El daemon solo escucha en 127.0.0.1; sin auth HTTP (localhost-only) pero
  con header `X-Waat-Token` generado en `~/.waat/token` como defensa extra.

## Testing

- Unit tests con `node:test` (sin frameworks pesados): API HTTP con Baileys
  mockeado (fakes de chats/mensajes), slug de carpeta, formato de mensajes,
  cola de transcripción.
- E2E manual documentado en `docs/TESTING.md`: vincular con QR, leer un chat
  real, descargar media, transcribir audio, enviar texto y media a un chat de
  prueba.
- CI (GitHub Actions): lint + typecheck + unit tests en Node 22.

## Fuera de scope (v1)

- Enviar/reaccionar a stickers, polls, locations.
- Grupos: solo lectura básica (listado y mensajes); gestión de miembros no.
- Multi-cuenta (una sesión por instalación).
- App web/móvil (la API HTTP deja la puerta abierta).
- Extracción de frames/audio de video.
