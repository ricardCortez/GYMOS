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
│   ├── main.py              ← FastAPI + todos los endpoints
│   ├── database.py          ← SQLAlchemy + SQLite
│   ├── face_service.py      ← InsightFace wrapper
│   └── routes/
│       ├── members.py
│       ├── memberships.py
│       ├── attendance.py
│       ├── payments.py
│       ├── face.py          ← registro e identificación
│       └── settings.py
│       └── auth.py
├── frontend/
│   └── index.html           ← Tu UI conectada al backend
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