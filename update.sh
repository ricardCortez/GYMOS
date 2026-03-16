#!/usr/bin/env bash
# =============================================================================
# GymOS - Script de actualización
# Uso: sudo bash update.sh
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'; BOLD='\033[1m'
info()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*" >&2; }

GYMOS_DIR="${GYMOS_DIR:-/opt/gymos}"
VENV="$GYMOS_DIR/venv"

if [[ $EUID -ne 0 ]]; then
    error "Ejecuta con sudo: sudo bash update.sh"
    exit 1
fi

echo -e "\n${BOLD}── GymOS Update ───────────────────────────────────${NC}"

# 1. Actualizar código
info "Descargando cambios del repositorio..."
git -C "$GYMOS_DIR" fetch --quiet
BEFORE=$(git -C "$GYMOS_DIR" rev-parse HEAD)
git -C "$GYMOS_DIR" pull --quiet
AFTER=$(git -C "$GYMOS_DIR" rev-parse HEAD)

if [[ "$BEFORE" == "$AFTER" ]]; then
    warn "Ya estás en la versión más reciente ($(git -C "$GYMOS_DIR" describe --tags --always 2>/dev/null || echo "$AFTER"))"
else
    info "Actualizado: ${BEFORE:0:7} → ${AFTER:0:7}"
    git -C "$GYMOS_DIR" log --oneline "$BEFORE..$AFTER"
fi

# 2. Actualizar dependencias Python
info "Actualizando dependencias Python..."
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet -r "$GYMOS_DIR/requirements.txt"

# 3. Verificar cambios en archivos de sistema
NGINX_CHANGED=false
SERVICE_CHANGED=false

if ! diff -q "$GYMOS_DIR/deploy/nginx.conf" /etc/nginx/sites-available/gymos &>/dev/null; then
    NGINX_CHANGED=true
    warn "nginx.conf ha cambiado — actualizando..."
    cp "$GYMOS_DIR/deploy/nginx.conf" /etc/nginx/sites-available/gymos
    nginx -t && info "Configuración de Nginx válida"
fi

if ! diff -q "$GYMOS_DIR/deploy/gymos.service" /etc/systemd/system/gymos.service &>/dev/null; then
    SERVICE_CHANGED=true
    warn "gymos.service ha cambiado — actualizando..."
    cp "$GYMOS_DIR/deploy/gymos.service" /etc/systemd/system/gymos.service
    systemctl daemon-reload
fi

# 4. Reiniciar servicios
info "Reiniciando GymOS..."
systemctl restart gymos
sleep 2

if systemctl is-active --quiet gymos; then
    info "GymOS corriendo correctamente"
else
    error "GymOS no inició — revisa los logs:"
    journalctl -u gymos --no-pager -n 20
    exit 1
fi

if [[ "$NGINX_CHANGED" == true ]]; then
    systemctl reload nginx
    info "Nginx recargado"
fi

echo ""
echo -e "${BOLD}${GREEN}Actualización completada.${NC}"
echo -e "  Versión: $(git -C "$GYMOS_DIR" describe --tags --always 2>/dev/null || git -C "$GYMOS_DIR" rev-parse --short HEAD)"
echo -e "  Estado:  $(systemctl is-active gymos)"
echo ""
