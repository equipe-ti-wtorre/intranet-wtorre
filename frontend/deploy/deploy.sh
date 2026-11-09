#!/usr/bin/env bash
#
# Deploy do frontend da intranet (build de producao servido estaticamente pelo nginx).
#
# Uso:
#   bash frontend/deploy/deploy.sh
#
# O que faz:
#   1. Compila o Angular em modo producao (npm run build) numa pasta temporaria.
#   2. Copia o resultado para dist/frontend/browser, que e o root do site no nginx do
#      aaPanel. O fallback de rotas da SPA (try_files -> /index.html) fica na regra
#      de URL rewrite do site, e /api/ e encaminhado para o backend na porta 3001.
#
# O build nao vai direto para dist/frontend/browser porque o aaPanel mantem ali um
# .user.ini imutavel (chattr +i) e o Angular falha ao tentar limpar a pasta.
# O index.html e copiado por ultimo para nunca apontar para chunks ainda ausentes.
# Chunks antigos ficam KEEP_DAYS dias para quem esta com a pagina aberta.
#
# Observacao: o nginx le os arquivos do disco a cada requisicao, entao apos o
# deploy os arquivos novos ja entram no ar SEM precisar recarregar o nginx.
#
set -euo pipefail

FRONT_DIR="/www/wwwroot/IntranetWTorre/intranet-wtorre/frontend"
DEST_DIR="${FRONT_DIR}/dist/frontend/browser"
NODE_BIN="/www/server/nodejs/v24.16.0/bin"
KEEP_DAYS=7
export PATH="${NODE_BIN}:${PATH}"

STAGE_DIR="$(mktemp -d /tmp/intranet-front-build.XXXXXX)"
trap 'rm -rf "${STAGE_DIR}"' EXIT

cd "${FRONT_DIR}"

echo "[deploy] Compilando frontend (producao) em ${STAGE_DIR}..."
npm run build -- --output-path "${STAGE_DIR}"

SRC_DIR="${STAGE_DIR}/browser"
if [[ ! -f "${SRC_DIR}/index.html" ]]; then
  echo "[deploy] Build sem index.html; nada foi publicado." >&2
  exit 1
fi

mkdir -p "${DEST_DIR}"

echo "[deploy] Publicando em ${DEST_DIR}..."
rsync -rltO --exclude '.user.ini' --exclude 'index.html' "${SRC_DIR}/" "${DEST_DIR}/"
rsync -rltO "${SRC_DIR}/index.html" "${DEST_DIR}/index.html"

echo "[deploy] Removendo arquivos de builds antigos (mais de ${KEEP_DAYS} dias)..."
while IFS= read -r -d '' file; do
  rel="${file#"${DEST_DIR}"/}"
  [[ -e "${SRC_DIR}/${rel}" ]] || rm -f "${file}"
done < <(find "${DEST_DIR}" -type f ! -name '.user.ini' -mtime "+${KEEP_DAYS}" -print0)

echo "[deploy] Concluido. Arquivos ja estao no ar (nginx serve do disco)."

# Descomente se algum dia precisar recarregar o nginx (ex.: mudou a config do site):
# sudo /www/server/nginx/sbin/nginx -t && sudo /www/server/nginx/sbin/nginx -s reload
