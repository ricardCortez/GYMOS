#!/usr/bin/env python3
"""
GymOS - Script de inicio

Uso:
  python run.py           → HTTP  (solo este PC,  cámara funciona)
  python run.py --https   → HTTPS (red local,      cámara funciona en otros PCs)
  python run.py --dev     → HTTP  con auto-reload  (desarrollo)

Variables de entorno (o .env):
  GYMOS_DATA_DIR   → ruta alternativa para datos/DB (ej: /mnt/data/gymOS)
  GYMOS_SECRET     → clave secreta JWT (cambiar en producción)
  GYMOS_PORT       → puerto del servidor (default: 8000)
"""
import sys
import socket
import pathlib

BASE_DIR = pathlib.Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))

# Importar configuración centralizada (respeta GYMOS_DATA_DIR, GYMOS_PORT, etc.)
from backend.config import CERTS_DIR, PORT, ensure_dirs

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
    use_https = "--https" in sys.argv
    dev_mode  = "--dev"   in sys.argv
    ip = get_local_ip()

    print()
    print("=" * 58)
    print("   GymOS  -  Sistema de Gestión de Gimnasio")
    if dev_mode:
        print("   [MODO DESARROLLO - auto-reload activo]")
    print("=" * 58)

    ssl_keyfile  = None
    ssl_certfile = None

    if use_https:
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
            print("   Después la cámara funcionará normalmente.")
        else:
            print(f"   Local :   http://localhost:{PORT}  (sin HTTPS)")
            use_https = False
    else:
        print(f"   Local :   http://localhost:{PORT}")
        print(f"   LAN   :   http://{ip}:{PORT}  (sin cámara desde red)")
        print()
        print("   La cámara NO funcionará desde otras PCs en HTTP.")
        print("   Para acceso con cámara desde la red local:")
        print("       pip install cryptography")
        print(f"      python run.py --https")
        print(f"      Luego abre: https://{ip}:{PORT}")

    print("   Ctrl+C para detener")
    print("=" * 58)
    print()

    try:
        import uvicorn
        uvicorn.run(
            "backend.main:app",
            host="0.0.0.0",
            port=PORT,
            reload=dev_mode,     # True solo con --dev (nunca en producción)
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
