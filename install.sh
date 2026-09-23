#!/usr/bin/env bash
#
# waat — instalador de un solo comando (sin npm publish)
#
#   curl -fsSL https://raw.githubusercontent.com/Drozast/waat/main/install.sh | bash
#
# Qué hace:
#   1. Verifica Node >= 22
#   2. Clona (o actualiza) el repo en ~/.waat-src
#   3. npm install + npm run build
#   4. Registra el MCP en opencode y Claude Code, y copia las skills
#
set -euo pipefail

REPO="https://github.com/Drozast/waat.git"
DEST="${WAAT_SRC:-$HOME/.waat-src}"

echo "==> waat installer"

# 1. Node >= 22
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js no está instalado. Instalá Node 22+ desde https://nodejs.org" >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "ERROR: waat requiere Node 22+ (tenés Node $NODE_MAJOR)." >&2
  exit 1
fi
echo "    node $(node -v) ✓"

# 2. Clonar o actualizar
if [ -d "$DEST/.git" ]; then
  echo "==> Actualizando $DEST"
  git -C "$DEST" pull --ff-only
else
  echo "==> Clonando a $DEST"
  git clone --depth 1 "$REPO" "$DEST"
fi

cd "$DEST"

# 3. Dependencias + build
echo "==> npm install"
npm install --no-fund --no-audit
echo "==> npm run build"
npm run build

# 4. Registrar MCP + skills
echo "==> Registrando MCP y skills"
node cli/dist/index.js install

echo
echo "✅ waat instalado."
echo
echo "Siguiente paso (una vez): vincular WhatsApp"
echo "    node $DEST/cli/dist/index.js link"
echo
echo "Después, en opencode o Claude Code pedí:"
echo "    \"leeme el chat con Juan y sacame los acuerdos\""
