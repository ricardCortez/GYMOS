# GymOS - Sistema de Gestión de Gimnasio

## Instalación Rápida

### Windows
```
1. Doble clic en  instalar.bat
2. Espera que termine
3. Ejecuta:  python run.py
4. Abre:     http://localhost:8000
```

### Linux / Mac
```bash
bash instalar.sh
python3 run.py
# Abre http://localhost:8000
```

## Estructura del Proyecto
```
gymOS/
├── backend/
    ├── main.py          →  84 líneas  (antes 500+)  solo inicializa
    ├── auth.py          →  41 líneas  JWT + bcrypt
    ├── database.py      → 230 líneas  modelos SQLAlchemy
    ├── face_service.py  → 142 líneas  InsightFace
    └── routes/
        ├── __init__.py
        ├── plans.py          →  72 líneas
        ├── members.py        →  90 líneas
        ├── face.py           → 107 líneas
        ├── attendance.py     →  98 líneas
        ├── memberships.py    → 107 líneas
        ├── payments.py       →  48 líneas
        ├── announcements.py  →  65 líneas
        ├── settings.py       →  34 líneas
        ├── dashboard.py      →  36 líneas
        ├── admin_users.py    → 176 líneas  (auth + usuarios)
        └── audio.py          → 105 líneas
├── frontend/
│   ├── index.html   ← Solo estructura HTML + CSS (58KB)
    └── app.js       ← Toda la lógica (93KB)
├── data/                    ← gymOS.db se crea aquí
├── requirements.txt
└── run.py                   ← Arranca todo

## Modelo de Reconocimiento Facial

Usa **InsightFace buffalo_l** (ArcFace pre-entrenado).

- Se descarga automáticamente la primera vez (~300MB)
- Corre en CPU (no necesita GPU)
- No entrena desde cero: registra embeddings de 512 dimensiones
- Agregar miembro = tomar 3-5 fotos (sin reentrenar)

## Acceso en Red Local

Una vez iniciado, cualquier dispositivo en la misma red puede
acceder a través del IP del servidor:

```
http://192.168.X.X:8000
```

## Funcionalidades

- ✅ Registro de miembros con foto
- ✅ Reconocimiento facial en tiempo real (webcam → servidor)
- ✅ Registro facial con 3-5 fotos + embedding promedio
- ✅ Huella dactilar (WebAuthn - Windows Hello / Touch ID)
- ✅ Check-in automático por reconocimiento
- ✅ Gestión de planes y membresías
- ✅ Pagos y historial
- ✅ Anuncios de voz programados
- ✅ Reportes y estadísticas
- ✅ Configuración del gimnasio

## Requisitos de Hardware

| Componente | Mínimo         | Recomendado    |
|------------|---------------|----------------|
| CPU        | Intel i5 8va  | i7 10ma+       |
| RAM        | 8 GB          | 16 GB          |
| Disco      | 5 GB libres   | SSD 20 GB      |
| Webcam     | 720p          | 1080p          |
| OS         | Windows 10    | Windows 11 / Ubuntu 22 |