# 🏋️ GymOS

### Sistema Integral de Gestión para Gimnasios con Reconocimiento Facial

GymOS es una plataforma web para la administración de gimnasios que integra:

* Gestión de miembros
* Control de asistencia automático
* Reconocimiento facial con IA
* Huella digital vía WebAuthn
* Gestión de planes y pagos
* Dashboard administrativo
* Anuncios programados por voz

---

# 🚀 Instalación Rápida

## 🪟 Windows

```
1. Doble clic en instalar_windows.bat
2. Espera que finalice la instalación
3. Ejecuta: python run.py
4. Abre: http://localhost:8000
```

---

## 🐧 Linux / macOS

```bash
bash instalar_linux.sh
python3 run.py
# Abrir http://localhost:8000
```

---

# ▶️ Ejecución Manual

Si ya tienes el entorno configurado:

```bash
pip install -r requirements.txt
python run.py
```

Servidor disponible en:

```
http://localhost:8000
```

---

# 🌐 Acceso en Red Local

Una vez iniciado, cualquier dispositivo en la misma red puede acceder usando la IP del servidor:

```
http://192.168.X.X:8000
```

Ejemplo:

```
http://192.168.50.70:8000
```

---

# 📁 Estructura del Proyecto

```
gymOS/
├── backend/
│   ├── main.py          → Inicializa FastAPI y registra rutas
│   ├── auth.py          → Autenticación JWT + bcrypt
│   ├── database.py      → Modelos y configuración SQLAlchemy
│   ├── face_service.py  → Servicio de reconocimiento facial (InsightFace)
│   ├── config.py        → Configuración general
│   ├── routes/
│   │   ├── admin_user.py
│   │   ├── admin_users.py
│   │   ├── plans.py
│   │   ├── members.py
│   │   ├── face.py
│   │   ├── attendance.py
│   │   ├── memberships.py
│   │   ├── payments.py
│   │   ├── announcements.py
│   │   ├── settings.py
│   │   ├── dashboard.py
│   │   └── audio.py
│
├── frontend/
│   ├── index.html       → Estructura HTML + estilos
│   └── app.js           → Lógica completa (SPA ligera)
│
├── data/                → Base de datos SQLite (gymOS.db)
├── requirements.txt     → Dependencias
├── run.py               → Punto de entrada del sistema
└── README.md
```

---

# 🧠 Arquitectura Técnica

## Backend

* FastAPI
* SQLAlchemy
* SQLite
* Autenticación con JWT
* Hash de contraseñas con bcrypt
* API modular por rutas
* Arquitectura desacoplada

## Frontend

* HTML + CSS puro
* JavaScript Vanilla
* Fetch API para comunicación con backend
* SPA basada en vistas dinámicas

---

# 📸 Modelo de Reconocimiento Facial

GymOS utiliza el modelo **InsightFace buffalo_l (ArcFace preentrenado)**.

Características:

* Descarga automática la primera vez (~300 MB)
* Funciona en CPU (no requiere GPU)
* No se entrena desde cero
* Genera embeddings de 512 dimensiones
* Registro facial con 3–5 fotos
* Embedding promedio para mayor precisión
* Check-in automático en tiempo real

---

# 🔐 Seguridad

* Autenticación con JWT
* Contraseñas hasheadas con bcrypt
* Protección por roles administrativos
* Soporte WebAuthn (Windows Hello / Touch ID)

---

# 📊 Funcionalidades

* ✅ Registro de miembros con fotografía
* ✅ Reconocimiento facial en tiempo real
* ✅ Registro biométrico facial
* ✅ Huella dactilar (WebAuthn)
* ✅ Check-in automático
* ✅ Gestión de planes y membresías
* ✅ Control de pagos e historial
* ✅ Dashboard con estadísticas
* ✅ Anuncios de voz programados
* ✅ Configuración general del gimnasio

---

# 💻 Requisitos de Hardware

| Componente | Mínimo       | Recomendado            |
| ---------- | ------------ | ---------------------- |
| CPU        | Intel i5 8va | i7 10ma o superior     |
| RAM        | 8 GB         | 16 GB                  |
| Disco      | 5 GB libres  | SSD 20 GB              |
| Webcam     | 720p         | 1080p                  |
| Sistema    | Windows 10   | Windows 11 / Ubuntu 22 |

---

# 📦 Dependencias Principales

* fastapi
* uvicorn
* sqlalchemy
* bcrypt
* python-jose
* insightface
* opencv-python
* numpy

---

# 🔮 Futuras Mejoras

* Multi-sucursal
* Dockerización
* Soporte PostgreSQL
* Control de acceso con hardware externo
* Dashboard analítico avanzado
* Notificaciones automatizadas
