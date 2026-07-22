#!/usr/bin/env bash
#
# Deploy do frontend da intranet (build de producao servido estaticamente pelo nginx).
#
# Uso:
#   bash frontend/deploy/deploy.sh
#
# O que faz:
#   1. Compila o Angular em modo producao (npm run build).
#   2. A saida vai para dist/frontend/browser, servida pelo processo "serve:prod"
#      (scripts/serve-static.mjs) na porta 4201, atras do reverse-proxy do aaPanel.
#
# Observacao: o serve:prod le os arquivos do disco a cada requisicao, entao apos
# um build os arquivos novos ja entram no ar SEM precisar reiniciar o processo
# nem recarregar o nginx.
#
set -euo pipefail

FRONT_DIR="/www/wwwroot/IntranetWTorre/intranet-wtorre/frontend"
NODE_BIN="/www/server/nodejs/v24.16.0/bin"
export PATH="${NODE_BIN}:${PATH}"

cd "${FRONT_DIR}"

echo "[deploy] Compilando frontend (producao)..."
npm run build

echo "[deploy] Build concluido -> ${FRONT_DIR}/dist/frontend/browser"
echo "[deploy] Arquivos ja estao no ar (nginx serve do disco)."

# Descomente se algum dia precisar recarregar o nginx (ex.: mudou a config do site):
# sudo /www/server/nginx/sbin/nginx -t && sudo /www/server/nginx/sbin/nginx -s reload
