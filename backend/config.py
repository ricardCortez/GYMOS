"""
GymOS - Configuración centralizada de rutas
Lee variables de entorno o .env para definir dónde se guardan los datos.

Uso en producción con partición separada:
    echo "GYMOS_DATA_DIR=/mnt/data/gymOS" > .env
    python run.py --https
"""
import os
import pathlib

# ── Cargar .env si existe ──────────────────────────────────────
def _load_dotenv():
    env_file = pathlib.Path(__file__).parent.parent / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key   = key.strip()
        value = value.strip()
        # Quitar comillas simples o dobles alrededor del valor
        if len(value) >= 2 and value[0] in ('"', "'") and value[0] == value[-1]:
            value = value[1:-1]
        if key and value and key not in os.environ:
            os.environ[key] = value

_load_dotenv()

# ── Rutas base ─────────────────────────────────────────────────
PROJECT_ROOT = pathlib.Path(__file__).parent.parent.resolve()

_data_env = os.environ.get("GYMOS_DATA_DIR", "").strip()
DATA_DIR   = pathlib.Path(_data_env) if _data_env else PROJECT_ROOT / "data"

DB_PATH   = DATA_DIR / "gymOS.db"
AUDIO_DIR = DATA_DIR / "audio"
CERTS_DIR = DATA_DIR / "certs"
LOGS_DIR  = DATA_DIR / "logs"

# ── Otras configuraciones ──────────────────────────────────────
SECRET_KEY = os.environ.get("GYMOS_SECRET", "gymos-secret-key-change-in-production-2024")
PORT       = int(os.environ.get("GYMOS_PORT", "8000"))

def ensure_dirs():
    """Crea todas las carpetas de datos si no existen."""
    for d in [DATA_DIR, AUDIO_DIR, CERTS_DIR, LOGS_DIR]:
        d.mkdir(parents=True, exist_ok=True)

def print_config():
    print(f"  Datos      :  {DATA_DIR}")
    print(f"  Base datos :  {DB_PATH}")
    print(f"  Audios     :  {AUDIO_DIR}")
    print(f"  Certs SSL  :  {CERTS_DIR}")