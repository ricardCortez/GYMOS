#!/usr/bin/env bash
# =============================================================================
# GymOS - Instalador automático para Linux
# Probado en: Ubuntu 22.04/24.04, Debian 11/12
#
# Uso:
#   curl -fsSL https://raw.githubusercontent.com/ricardCortez/GYMOS/main/install.sh | sudo bash
#   o bien:
#   sudo bash install.sh
#
# Variables de entorno opcionales (antes de ejecutar):
#   GYMOS_SECRET=<clave-jwt>          (auto-generada si no se define)
#   GYMOS_PORT=8000
#   GYMOS_DATA_DIR=/opt/gymos/data    (por defecto)
#   GYMOS_REPO=https://github.com/ricardCortez/GYMOS.git
#   GYMOS_BRANCH=main
# =============================================================================
set -euo pipefail

# ── Colores ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${GREEN}[✓]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✗]${NC} $*" >&2; }
section() { echo -e "\n${BOLD}${BLUE}── $* ──────────────────────────────────${NC}"; }

# ── Configuración ─────────────────────────────────────────────────────────────
GYMOS_USER="${GYMOS_USER:-gymos}"
GYMOS_DIR="${GYMOS_DIR:-/opt/gymos}"
GYMOS_DATA_DIR="${GYMOS_DATA_DIR:-$GYMOS_DIR/data}"
GYMOS_PORT="${GYMOS_PORT:-8000}"
GYMOS_REPO="${GYMOS_REPO:-https://github.com/ricardCortez/GYMOS.git}"
GYMOS_BRANCH="${GYMOS_BRANCH:-main}"
PYTHON_MIN="3.10"

# ── Verificaciones ────────────────────────────────────────────────────────────
section "Verificaciones previas"

if [[ $EUID -ne 0 ]]; then
    error "Este script debe ejecutarse como root (sudo bash install.sh)"
    exit 1
fi

# Detectar distro
if command -v apt-get &>/dev/null; then
    PKG_MANAGER="apt"
elif command -v dnf &>/dev/null; then
    PKG_MANAGER="dnf"
elif command -v yum &>/dev/null; then
    PKG_MANAGER="yum"
else
    error "Gestor de paquetes no soportado (se necesita apt, dnf o yum)"
    exit 1
fi
info "Distro detectada: $PKG_MANAGER"

# ── Dependencias del sistema ───────────────────────────────────────────────────
section "Instalando dependencias del sistema"

if [[ "$PKG_MANAGER" == "apt" ]]; then
    apt-get update -qq
    apt-get install -y --no-install-recommends \
        git python3 python3-pip python3-venv \
        python3-dev build-essential \
        libglib2.0-0 libgl1-mesa-glx libgomp1 \
        nginx certbot python3-certbot-nginx \
        curl wget ca-certificates
else
    $PKG_MANAGER install -y \
        git python3 python3-pip python3-venv \
        python3-devel gcc gcc-c++ \
        mesa-libGL libgomp \
        nginx certbot python3-certbot-nginx \
        curl wget ca-certificates
fi
info "Dependencias del sistema instaladas"

# ── Verificar versión de Python ────────────────────────────────────────────────
PYTHON_BIN=$(command -v python3)
PYTHON_VER=$($PYTHON_BIN -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
if python3 -c "import sys; exit(0 if sys.version_info >= (3,10) else 1)"; then
    info "Python $PYTHON_VER detectado"
else
    error "Se requiere Python $PYTHON_MIN o superior (detectado: $PYTHON_VER)"
    exit 1
fi

# ── Usuario del sistema ────────────────────────────────────────────────────────
section "Configurando usuario del sistema '$GYMOS_USER'"

if ! id "$GYMOS_USER" &>/dev/null; then
    useradd --system --shell /bin/false --home-dir "$GYMOS_DIR" \
            --comment "GymOS service account" "$GYMOS_USER"
    info "Usuario $GYMOS_USER creado"
else
    warn "Usuario $GYMOS_USER ya existe"
fi

# ── Clonar o actualizar el repositorio ────────────────────────────────────────
section "Descargando GymOS"

if [[ -d "$GYMOS_DIR/.git" ]]; then
    warn "Repositorio ya existe en $GYMOS_DIR — actualizando"
    git -C "$GYMOS_DIR" fetch --quiet
    git -C "$GYMOS_DIR" checkout "$GYMOS_BRANCH" --quiet
    git -C "$GYMOS_DIR" pull --quiet
else
    git clone --branch "$GYMOS_BRANCH" --depth 1 "$GYMOS_REPO" "$GYMOS_DIR"
fi
info "Código en $GYMOS_DIR"

# ── Entorno virtual Python ─────────────────────────────────────────────────────
section "Configurando entorno virtual Python"

VENV="$GYMOS_DIR/venv"
if [[ ! -d "$VENV" ]]; then
    python3 -m venv "$VENV"
    info "Virtualenv creado en $VENV"
fi

"$VENV/bin/pip" install --quiet --upgrade pip wheel setuptools
"$VENV/bin/pip" install --quiet -r "$GYMOS_DIR/requirements.txt"
info "Dependencias Python instaladas"

# ── Directorios de datos ───────────────────────────────────────────────────────
section "Creando directorios de datos"

for dir in "$GYMOS_DATA_DIR" \
           "$GYMOS_DATA_DIR/logs" \
           "$GYMOS_DATA_DIR/audio" \
           "$GYMOS_DATA_DIR/certs" \
           "$GYMOS_DATA_DIR/models"; do
    mkdir -p "$dir"
done
info "Directorios creados en $GYMOS_DATA_DIR"

# ── Generar .env si no existe ─────────────────────────────────────────────────
section "Configurando .env"

ENV_FILE="$GYMOS_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
    GENERATED_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    cat > "$ENV_FILE" <<EOF
# GymOS - Configuración de producción
# Generado automáticamente por install.sh

GYMOS_SECRET=${GYMOS_SECRET:-$GENERATED_SECRET}
GYMOS_HOST=127.0.0.1
GYMOS_PORT=$GYMOS_PORT
GYMOS_WORKERS=1
GYMOS_DATA_DIR=$GYMOS_DATA_DIR
EOF
    info ".env generado con clave secreta aleatoria"
else
    warn ".env ya existe — no se sobreescribe"
fi

# ── Permisos ──────────────────────────────────────────────────────────────────
section "Configurando permisos"

chown -R "$GYMOS_USER:$GYMOS_USER" "$GYMOS_DIR"
chmod 750 "$GYMOS_DIR"
chmod 600 "$ENV_FILE"
chmod -R 750 "$GYMOS_DATA_DIR"
info "Permisos configurados"

# ── Generar certificado SSL autofirmado ───────────────────────────────────────
section "Generando certificado SSL autofirmado (red local)"

CERT_FILE="$GYMOS_DATA_DIR/certs/cert.pem"
KEY_FILE="$GYMOS_DATA_DIR/certs/key.pem"

if [[ ! -f "$CERT_FILE" ]]; then
    LOCAL_IP=$(hostname -I | awk '{print $1}')
    "$VENV/bin/pip" install --quiet cryptography 2>/dev/null || true
    "$VENV/bin/python3" - <<PYEOF
import pathlib, ipaddress
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from datetime import datetime, timedelta, timezone

ip = "$LOCAL_IP"
key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
now = datetime.now(timezone.utc)
subject = issuer = x509.Name([
    x509.NameAttribute(NameOID.COUNTRY_NAME, "PE"),
    x509.NameAttribute(NameOID.ORGANIZATION_NAME, "GymOS"),
    x509.NameAttribute(NameOID.COMMON_NAME, ip),
])
cert = (
    x509.CertificateBuilder()
    .subject_name(subject).issuer_name(issuer)
    .public_key(key.public_key())
    .serial_number(x509.random_serial_number())
    .not_valid_before(now)
    .not_valid_after(now + timedelta(days=3650))
    .add_extension(x509.SubjectAlternativeName([
        x509.DNSName("localhost"),
        x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
        x509.IPAddress(ipaddress.IPv4Address(ip)),
    ]), critical=False)
    .sign(key, hashes.SHA256())
)
pathlib.Path("$CERT_FILE").write_bytes(cert.public_bytes(serialization.Encoding.PEM))
pathlib.Path("$KEY_FILE").write_bytes(key.private_bytes(
    serialization.Encoding.PEM,
    serialization.PrivateFormat.TraditionalOpenSSL,
    serialization.NoEncryption(),
))
print(f"Certificado generado para IP: {ip}")
PYEOF
    chown "$GYMOS_USER:$GYMOS_USER" "$CERT_FILE" "$KEY_FILE"
    chmod 600 "$KEY_FILE"
    info "Certificado SSL autofirmado generado"
else
    warn "Certificado SSL ya existe — no se sobreescribe"
fi

# ── Instalar systemd service ───────────────────────────────────────────────────
section "Instalando servicio systemd"

cp "$GYMOS_DIR/deploy/gymos.service"       /etc/systemd/system/gymos.service
cp "$GYMOS_DIR/deploy/uvicorn-log.json"    "$GYMOS_DIR/deploy/uvicorn-log.json"
systemctl daemon-reload
systemctl enable gymos
info "Servicio gymos registrado en systemd"

# ── Configurar Nginx ───────────────────────────────────────────────────────────
section "Configurando Nginx"

cp "$GYMOS_DIR/deploy/nginx.conf" /etc/nginx/sites-available/gymos

if [[ ! -L /etc/nginx/sites-enabled/gymos ]]; then
    ln -s /etc/nginx/sites-available/gymos /etc/nginx/sites-enabled/gymos
fi

# Desactivar default de nginx si existe
if [[ -L /etc/nginx/sites-enabled/default ]]; then
    rm /etc/nginx/sites-enabled/default
    warn "Site 'default' de Nginx desactivado"
fi

nginx -t && info "Configuración de Nginx válida"

# ── Configurar logrotate ───────────────────────────────────────────────────────
cp "$GYMOS_DIR/deploy/logrotate.conf" /etc/logrotate.d/gymos
info "Logrotate configurado"

# ── Iniciar servicios ─────────────────────────────────────────────────────────
section "Iniciando servicios"

systemctl start gymos
sleep 2
if systemctl is-active --quiet gymos; then
    info "GymOS corriendo"
else
    error "GymOS no inició correctamente"
    journalctl -u gymos --no-pager -n 30
    exit 1
fi

systemctl reload-or-restart nginx
info "Nginx recargado"

# ── Resumen ───────────────────────────────────────────────────────────────────
LOCAL_IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${BOLD}${GREEN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║         GymOS instalado correctamente          ║${NC}"
echo -e "${BOLD}${GREEN}╚════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}URL local:${NC}   https://localhost"
echo -e "  ${BOLD}URL LAN:${NC}     https://$LOCAL_IP"
echo ""
echo -e "  ${YELLOW}NOTA:${NC} El navegador mostrará advertencia SSL (certificado"
echo -e "  autofirmado). Haz clic en 'Avanzado' → 'Continuar de todas formas'."
echo ""
echo -e "  ${BOLD}Comandos útiles:${NC}"
echo -e "    sudo systemctl status gymos"
echo -e "    sudo journalctl -u gymos -f"
echo -e "    sudo bash $GYMOS_DIR/update.sh"
echo ""
echo -e "  ${BOLD}Para HTTPS con dominio real (Let's Encrypt):${NC}"
echo -e "    sudo certbot --nginx -d tudominio.com"
echo ""
