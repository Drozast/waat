---
name: waat
description: Leer y escribir conversaciones de WhatsApp vinculadas. Usar cuando el usuario pida revisar, leer, buscar o extraer información de un chat de WhatsApp, descargar media de WhatsApp, o enviar un mensaje por WhatsApp.
---

# waat — WhatsApp Agent Toolkit

Herramientas MCP `waat_*` para hablar con el WhatsApp del usuario (vinculado una vez).

## Flujo estándar

1. `waat_status` — verificar que `state` sea `online`. Si es `offline`/`needs_relink`, decirle al usuario que corra `npx waat link` y escanee el QR.
2. `waat_list_chats` (con `q` si el usuario dio un nombre) — identificar el `chatId`.
3. `waat_read_chat` con ese `chatId` — leer los mensajes (paginado con `before` si hay más).
4. Si hay media relevante (`[imagen]`, `[audio]`, `[video]`, `[documento]` en el texto), `waat_download_media` con el `messageKey` correspondiente. Los audios ya vienen transcritos; las imágenes se leen por su ruta.
5. Resumir/extraer la info que pidió el usuario.

## Reglas

- Antes de `waat_send_text` o `waat_send_media`, mostrar al usuario qué se va a enviar y a qué chat, y esperar confirmación (salvo que ya la haya dado).
- `waat_search` para encontrar un dato específico sin leer todo el chat.
- Si un tool devuelve `{"ok":false,"error":"offline"}`, no reintentar en loop: avisar al usuario.
- Las rutas de media descargada están en `~/waat/<chat>/`.
