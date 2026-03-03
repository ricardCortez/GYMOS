#!/usr/bin/env python3
"""
GymOS - Script de inicio
Uso: python run.py
El sistema queda accesible en http://localhost:8000
En red local: http://192.168.X.X:8000
"""
import sys, os, subprocess, socket

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except:
        return "localhost"
    finally:
        s.close()

if __name__ == "__main__":
    ip = get_local_ip()
    print("=" * 55)
    print("  GymOS - Sistema de Gestión de Gimnasio")
    print("=" * 55)
    print(f"  Local:    http://localhost:8000")
    print(f"  Red LAN:  http://{ip}:8000")
    print("  (Ctrl+C para detener)")
    print("=" * 55)

    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info",
    )