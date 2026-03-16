#!/usr/bin/env python3
"""
GymOS - Script de inicio

Uso:
  python run.py            → HTTP  en 0.0.0.0:8000   (acceso directo, cámara local)
  python run.py --https    → HTTPS con cert autofirmado (cámara desde red local)
  python run.py --dev      → HTTP  con auto-reload      (desarrollo)

En producción detrás de Nginx el servidor se configura con variables de entorno:
  GYMOS_HOST=127.0.0.1    → solo escucha en loopback (Nginx hace el proxy)
  GYMOS_PORT=8000
  GYMOS_WORKERS=1         → 1 worker (face_service usa cache en memoria)

Variables adicionales (ver .env.example):
  GYMOS_SECRET   → clave JWT
  GYMOS_DATA_DIR → ruta de datos/BD
"""
import sys
import socket
import pathlib

BASE_DIR = pathlib.Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))

# Configuración centralizada (carga .env automáticamente)
from backend.config import CERTS_DIR, PORT, HOST, WORKERS, ensure_dirs, print_config

ensure_dirs()

CERT_FILE = CERTS_DIR / "cert.pem"
KEY_FILE  = CERTS_DIR / "key.pem"


def get_local_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "localhost"
    finally:
        s.close()


def generate_self_signed_cert(ip: str) -> bool:
    """Genera certificado autofirmado para el IP local. Válido 10 años."""
    CERTS_DIR.mkdir(parents=True, exist_ok=True)
    if CERT_FILE.exists() and KEY_FILE.exists():
        print("  Certificado SSL ya existe.")
        return True
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.x509 import DNSName, IPAddress
        import ipaddress
        from datetime import datetime, timedelta, timezone

        print(f"  Generando certificado SSL para {ip}...")
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

        now = datetime.now(timezone.utc)
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, "PE"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "GymOS"),
            x509.NameAttribute(NameOID.COMMON_NAME, ip),
        ])

        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now)
            .not_valid_after(now + timedelta(days=3650))
            .add_extension(
                x509.SubjectAlternativeName([
                    DNSName("localhost"),
                    IPAddress(ipaddress.IPv4Address("127.0.0.1")),
                    IPAddress(ipaddress.IPv4Address(ip)),
                ]),
                critical=False,
            )
            .sign(key, hashes.SHA256())
        )

        CERT_FILE.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
        KEY_FILE.write_bytes(key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        ))
        print(f"  Certificado creado: {CERT_FILE}")
        return True

    except ImportError:
        print("  AVISO: instala 'cryptography' para HTTPS:")
        print("         pip install cryptography")
        return False
    except Exception as exc:
        print(f"  Error generando certificado: {exc}")
        return False


if __name__ == "__main__":
    use_https = "--https"  in sys.argv
    dev_mode  = "--dev"    in sys.argv

    # Detrás de Nginx (GYMOS_HOST=127.0.0.1) no necesita HTTPS propio
    behind_proxy = HOST == "127.0.0.1"

    ip = get_local_ip()

    print()
    print("=" * 62)
    print("   GymOS  -  Sistema de Gestión de Gimnasio")
    if dev_mode:
        print("   [MODO DESARROLLO - auto-reload activo]")
    if behind_proxy:
        print("   [MODO PRODUCCIÓN - detrás de Nginx]")
    print("=" * 62)
    print_config()
    print("=" * 62)

    ssl_keyfile  = None
    ssl_certfile = None

    if use_https and not behind_proxy:
        ok = generate_self_signed_cert(ip)
        if ok:
            ssl_certfile = str(CERT_FILE)
            ssl_keyfile  = str(KEY_FILE)
            print(f"   Local :   https://localhost:{PORT}")
            print(f"   LAN   :   https://{ip}:{PORT}")
            print()
            print("   IMPORTANTE: La primera vez que abras desde otra PC,")
            print("   el navegador mostrará 'Sitio no seguro'.")
            print("   Haz clic en 'Configuración avanzada' → 'Continuar'.")
        else:
            print(f"   Iniciando en HTTP (sin certificado SSL)")
    elif not behind_proxy:
        print(f"   Local :   http://localhost:{PORT}")
        print(f"   LAN   :   http://{ip}:{PORT}  (sin cámara desde red)")
        print()
        print("   Para cámara en red local: python run.py --https")

    if behind_proxy:
        print(f"   Uvicorn escucha en: {HOST}:{PORT}  (Nginx hace el proxy)")

    print("   Ctrl+C para detener")
    print("=" * 62)
    print()

    try:
        import uvicorn
        uvicorn.run(
            "backend.main:app",
            host=HOST,
            port=PORT,
            workers=WORKERS,
            reload=dev_mode and not behind_proxy,  # nunca recargar en producción
            log_level="info",
            ssl_certfile=ssl_certfile,
            ssl_keyfile=ssl_keyfile,
        )
    except ImportError as exc:
        import traceback
        traceback.print_exc()
        print(f"\nERROR de importación: {exc}")
        print("Verifica que todos los módulos estén instalados:")
        print("  pip install -r requirements.txt")
        sys.exit(1)
    except Exception as exc:
        import traceback
        traceback.print_exc()
        print(f"\nERROR al iniciar: {exc}")
        sys.exit(1)
