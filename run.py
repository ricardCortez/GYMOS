#!/usr/bin/env python3
"""
GymOS - Script de Inicio con HTTPS opcional
- localhost:8000  → HTTP normal (cámara funciona)
- red local       → HTTPS con certificado autofirmado (cámara funciona en otros PCs)

Uso:
  python run.py          → HTTP  (solo este PC)
  python run.py --https  → HTTPS (acceso desde red local)
"""
import sys, os, socket, subprocess, pathlib

BASE_DIR = pathlib.Path(__file__).parent
CERT_DIR = BASE_DIR / "data" / "certs"
CERT_FILE = CERT_DIR / "cert.pem"
KEY_FILE  = CERT_DIR / "key.pem"

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except:
        return "localhost"
    finally:
        s.close()

def generate_self_signed_cert(ip):
    """Genera certificado autofirmado para el IP local."""
    CERT_DIR.mkdir(parents=True, exist_ok=True)
    if CERT_FILE.exists() and KEY_FILE.exists():
        print("  Certificado SSL ya existe.")
        return True
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.x509 import SubjectAlternativeName, DNSName, IPAddress
        import ipaddress, datetime

        print(f"  Generando certificado SSL para {ip}...")
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

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
            .not_valid_before(datetime.datetime.utcnow())
            .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=3650))
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
    except Exception as e:
        print(f"  Error generando certificado: {e}")
        return False

if __name__ == "__main__":
    use_https = "--https" in sys.argv
    ip = get_local_ip()

    print()
    print("=" * 58)
    print("   GymOS  -  Sistema de Gestión de Gimnasio")
    print("=" * 58)

    ssl_keyfile  = None
    ssl_certfile = None

    if use_https:
        ok = generate_self_signed_cert(ip)
        if ok:
            ssl_certfile = str(CERT_FILE)
            ssl_keyfile  = str(KEY_FILE)
            print(f"   Local :   https://localhost:8000")
            print(f"   LAN   :   https://{ip}:8000")
            print()
            print("   IMPORTANTE: La primera vez que abras desde otra PC,")
            print("   el navegador mostrará 'Sitio no seguro'.")
            print("   Haz clic en 'Configuración avanzada' → 'Continuar'.")
            print("   Después la cámara funcionará normalmente.")
        else:
            print(f"   Local :   http://localhost:8000  (sin HTTPS)")
            use_https = False
    else:
        print(f"   Local :   http://localhost:8000")
        print(f"   LAN   :   http://{ip}:8000  (sin cámara)")
        print()
        print("   ⚠  La cámara NO funcionará desde otras PCs en HTTP.")
        print("   ✅  Para acceso con cámara desde la red local:")
        print("       pip install cryptography")
        print(f"      python run.py --https")
        print(f"      Luego abre: https://{ip}:8000")

    print("   Ctrl+C para detener")
    print("=" * 58)
    print()

    try:
        import uvicorn
        uvicorn.run(
            "backend.main:app",
            host="0.0.0.0",
            port=8000,
            reload=False,
            log_level="info",
            ssl_certfile=ssl_certfile,
            ssl_keyfile=ssl_keyfile,
        )
    except ImportError:
        print("ERROR: Ejecuta primero: pip install -r requirements.txt")
        sys.exit(1)