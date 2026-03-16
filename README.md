# 🏋️ GymOS

### Sistema Integral de Gestión para Gimnasios con Reconocimiento Facial

GymOS es una plataforma web para la administración de gimnasios que integra:

* Gestión de miembros
* Control de asistencia automático con reconocimiento facial en tiempo real
* Reconocimiento facial con IA (InsightFace ArcFace buffalo_l)
* Gestión de planes, membresías y pagos
* Dashboard administrativo con estadísticas
* Anuncios programados por voz (Text-to-Speech)
* Promociones y descuentos
* Roles de acceso (superadmin / admin / staff)

---

# 🚀 Instalación

## 🐧 Linux (Ubuntu/Debian) — Instalación automática

```bash
sudo bash install.sh
```

El script crea el usuario del sistema, instala dependencias, configura Nginx, genera el certificado SSL y habilita el servicio systemd.

## 🪟 Windows — Desarrollo local

```bash
pip install -r requirements.txt
python run.py           # HTTP  → http://localhost:8000
python run.py --https   # HTTPS → https://localhost:8000  (cámara en red local)
python run.py --dev     # HTTP  con auto-reload
```

---

# 🌐 Acceso

| Modo | URL |
|------|-----|
| Local (HTTP) | `http://localhost:8000` |
| Local (HTTPS) | `https://localhost:8000` |
| Red local | `https://<IP-del-servidor>:<puerto>` |

> **Nota:** Al usar certificado autofirmado el navegador mostrará advertencia SSL.
> Haz clic en *Configuración avanzada* → *Continuar de todas formas*.

---

# 🔄 Actualización del servidor

```bash
sudo bash update.sh
```

---

# 📁 Estructura del Proyecto

```
GYMOS/
├── run.py                    → Punto de entrada
│                               python run.py [--https] [--dev]
├── install.sh                → Instalador automático Linux
├── update.sh                 → Script de actualización Linux
├── requirements.txt          → Dependencias Python
├── .env.example              → Plantilla de variables de entorno
│
├── backend/                  → Paquete Python (FastAPI)
│   ├── config.py             → Rutas y variables de entorno
│   ├── auth.py               → JWT + bcrypt + roles
│   ├── models.py             → Modelos SQLAlchemy (ORM)
│   ├── database.py           → Engine, sesión, migraciones, WAL
│   ├── face_service.py       → Reconocimiento facial InsightFace
│   └── routes/
│       ├── admin_users.py    → Auth + gestión de usuarios admin
│       ├── members.py        → CRUD miembros
│       ├── memberships.py    → Membresías y renovaciones
│       ├── payments.py       → Pagos e historial
│       ├── attendance.py     → Check-in y estadísticas
│       ├── face.py           → Registro e identificación facial
│       ├── plans.py          → Planes del gimnasio
│       ├── promotions.py     → Promociones y descuentos
│       ├── announcements.py  → Anuncios
│       ├── audio.py          → Archivos de audio TTS
│       ├── dashboard.py      → KPIs y estadísticas
│       ├── settings.py       → Configuración del gimnasio
│       └── tools.py          → Exportación CSV, limpieza (superadmin)
│
├── frontend/                 → SPA (HTML + JS Vanilla)
│   ├── index.html            → Shell HTML
│   ├── style.css / themes.css
│   ├── js/
│   │   ├── core.js           → Globals, helpers API
│   │   ├── auth.js           → Login / logout / roles
│   │   ├── boot.js           → Inicialización post-login
│   │   ├── camera.js         → Cámara en tiempo real
│   │   ├── tts.js            → Text-to-Speech
│   │   ├── ui.js             → Navegación, modales, toasts
│   │   └── views/            → Lógica de cada vista
│   └── views/                → Templates HTML (carga dinámica)
│
├── deploy/                   → Archivos de despliegue Linux
│   ├── gymos.service         → Unidad systemd
│   ├── nginx.conf            → Reverse proxy + SSL
│   ├── logrotate.conf        → Rotación de logs
│   └── uvicorn-log.json      → Configuración de logging
│
└── data/                     → Generado en runtime (excluido de git)
    ├── gymOS.db              → Base de datos SQLite
    ├── audio/                → Audios subidos
    ├── certs/                → Certificados SSL
    ├── models/               → Modelo InsightFace buffalo_l (~300 MB)
    └── logs/                 → Logs del servidor
```

---

# 🏗️ Arquitectura

```
Navegador
    │ HTTPS
    ▼
Nginx  (SSL, rate limiting, headers de seguridad)
    │ HTTP → 127.0.0.1:8000
    ▼
Uvicorn + FastAPI  (1 worker — face_service usa caché en memoria)
    │
    ├── SQLite (WAL mode, índices optimizados)
    └── InsightFace buffalo_l (ArcFace, CPU, embeddings 512-dim)
```

---

# 🧠 Reconocimiento Facial

GymOS utiliza el modelo **InsightFace buffalo_l (ArcFace preentrenado)**.

* Se descarga automáticamente la primera vez (~300 MB) en `data/models/`
* Funciona en CPU (no requiere GPU)
* No se entrena desde cero — registra embeddings por miembro
* Embeddings de 512 dimensiones, comparación por distancia coseno
* Registro con múltiples fotos → embedding promedio
* Check-in automático en tiempo real (cada 800 ms)
* Thread-safe con `RLock` para acceso concurrente

---

# 🔐 Seguridad

* Autenticación con JWT (firmado con clave configurable)
* Contraseñas hasheadas con bcrypt
* Roles: `superadmin` / `admin` / `staff`
* Nginx: rate limiting en login (5 req/min), cabeceras HSTS, X-Frame-Options
* Systemd: `PrivateTmp`, `ProtectSystem=strict`, `NoNewPrivileges`
* Usuario de sistema dedicado `gymos` (sin shell)

---

# 📊 Funcionalidades

* ✅ Registro de miembros con reconocimiento facial
* ✅ Check-in automático por cara
* ✅ Gestión de planes y membresías
* ✅ Control de pagos e historial
* ✅ Dashboard con estadísticas en tiempo real
* ✅ Anuncios de voz programados (TTS)
* ✅ Promociones y descuentos con validación
* ✅ Exportación de reportes en CSV
* ✅ Configuración general del gimnasio
* ✅ Gestión de usuarios admin con roles

---

# 💻 Requisitos de Hardware

| Componente | Mínimo           | Recomendado              |
|------------|------------------|--------------------------|
| CPU        | Intel i5 8va gen | i7 10ma gen o superior   |
| RAM        | 8 GB             | 16 GB                    |
| Disco      | 5 GB libres      | SSD 20 GB                |
| Webcam     | 720p             | 1080p                    |
| Sistema    | Ubuntu 22.04     | Ubuntu 24.04 / Windows 11|

---

# 📦 Dependencias Principales

* `fastapi` + `uvicorn` — servidor web ASGI
* `sqlalchemy` — ORM y migraciones
* `python-jose` + `bcrypt` — autenticación
* `insightface` + `onnxruntime` — reconocimiento facial
* `opencv-python` + `numpy` — procesamiento de imagen
* `Pillow` — conversión de imágenes

---

# 🔮 Futuras Mejoras

* Multi-sucursal
* Docker / docker-compose
* Soporte PostgreSQL
* Control de acceso con hardware (torniquete)
* Dashboard analítico avanzado
* Notificaciones automatizadas (email / SMS)
