"""
GymOS - Infraestructura de Base de Datos

Responsabilidades:
  - Crear el engine SQLite con configuración de rendimiento
  - Proveer la sesión (SessionLocal / get_db)
  - Inicializar y migrar el esquema al arrancar

Los modelos ORM están en backend/models.py.
"""
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
import json, uuid, sqlite3

from .config import DB_PATH, ensure_dirs

# Re-exportar todos los modelos → los imports existentes en routes no cambian
from .models import (                                          # noqa: F401
    Base,
    Plan, Member, Membership, Attendance,
    Payment, Announcement, Setting, Promotion,
    AdminUser, AudioAnnouncement,
)

# ── Engine ────────────────────────────────────────────────────
ensure_dirs()

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragmas(dbapi_conn, _):
    """WAL mode: lecturas concurrentes sin bloquear escrituras."""
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA synchronous=NORMAL")
    cur.execute("PRAGMA foreign_keys=ON")
    cur.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# ── Sesión por request ────────────────────────────────────────
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Migración automática ──────────────────────────────────────
def _migrate_db():
    """
    Agrega columnas nuevas a tablas ya existentes.
    SQLite no soporta DROP/ALTER completo, se hace columna a columna.
    """
    conn = sqlite3.connect(str(DB_PATH))
    cur  = conn.cursor()

    def add_col(table, column, col_type, default=None):
        try:
            cur.execute(f"SELECT {column} FROM {table} LIMIT 1")
        except sqlite3.OperationalError:
            clause = f" DEFAULT {default}" if default is not None else ""
            cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}{clause}")
            print(f"  [migración] {table}.{column} agregada")

    add_col("plans",   "color",        "TEXT",    "'#ff4500'")
    add_col("members", "updated_at",   "DATETIME")
    add_col("members", "credential_id","TEXT")
    add_col("attendance", "confidence","REAL")
    add_col("attendance", "notes",     "TEXT", "''")
    add_col("payments",   "reference", "TEXT", "''")

    for col, typ, dflt in [
        ("avatar",     "TEXT",     "''"),
        ("last_login", "DATETIME", None),
        ("created_by", "TEXT",     None),
    ]:
        try:
            add_col("admin_users", col, typ, dflt)
        except Exception:
            pass

    try:
        add_col("audio_announcements", "size_kb", "INTEGER", "0")
    except Exception:
        pass

    # Tabla promotions (si venía de una versión sin ella)
    try:
        cur.execute("SELECT id FROM promotions LIMIT 1")
    except sqlite3.OperationalError:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS promotions (
                id             TEXT PRIMARY KEY,
                name           TEXT NOT NULL,
                description    TEXT DEFAULT '',
                code           TEXT DEFAULT '',
                discount_type  TEXT DEFAULT 'percent',
                discount_value REAL DEFAULT 0,
                applies_to     TEXT DEFAULT '[]',
                start_date     TEXT NOT NULL,
                end_date       TEXT NOT NULL,
                start_time     TEXT DEFAULT '00:00',
                end_time       TEXT DEFAULT '23:59',
                uses_limit     INTEGER DEFAULT 0,
                uses_count     INTEGER DEFAULT 0,
                active         INTEGER DEFAULT 1,
                created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        print("  [migración] tabla promotions creada")

    conn.commit()
    conn.close()


# ── Inicialización ────────────────────────────────────────────
def init_db():
    """Crea tablas, aplica migraciones e inserta datos por defecto."""
    Base.metadata.create_all(bind=engine)

    try:
        _migrate_db()
    except Exception as exc:
        print(f"  [migración] advertencia: {exc}")

    db = SessionLocal()

    # Configuración por defecto
    defaults = {
        "gymName":        "Mi Gimnasio",
        "currency":       "S/",
        "openTime":       "06:00",
        "closeTime":      "22:00",
        "faceThreshold":  "0.45",
        "checkinCooldown":"3600",
        "timezone":       "-5",
        "togWelcome":     "true",
        "togRenew":       "true",
        "togOpen":        "true",
        "togClose":       "true",
    }
    for k, v in defaults.items():
        if not db.query(Setting).filter_by(key=k).first():
            db.add(Setting(key=k, value=v))

    # Planes de ejemplo
    if not db.query(Plan).first():
        db.add_all([
            Plan(id=str(uuid.uuid4()), name="Basico",  price=59,  duration=30,  icon="💪",
                 features=json.dumps(["Sala de pesas", "Horario estándar", "Casillero"])),
            Plan(id=str(uuid.uuid4()), name="Premium", price=99,  duration=30,  icon="🔥",
                 features=json.dumps(["Acceso total", "Clases grupales", "Sauna", "Nutricionista"]),
                 featured=True),
            Plan(id=str(uuid.uuid4()), name="Anual",   price=799, duration=365, icon="⭐",
                 features=json.dumps(["Todo Premium", "Sin matrícula"])),
        ])

    # Anuncios de ejemplo
    if not db.query(Announcement).first():
        db.add_all([
            Announcement(
                id=str(uuid.uuid4()),
                text="Buenos días! El gimnasio está abierto. ¡A entrenar con todo!",
                time="06:00",
                days=json.dumps(["lun", "mar", "mié", "jue", "vie"]),
            ),
            Announcement(
                id=str(uuid.uuid4()),
                text="El gimnasio cerrará en 30 minutos. Gracias por entrenar con nosotros.",
                time="21:30",
                days=json.dumps(["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]),
            ),
        ])

    # Superadmin por defecto
    from .auth import hash_password
    if not db.query(AdminUser).first():
        db.add(AdminUser(
            id=str(uuid.uuid4()),
            username="admin",
            display_name="Administrador",
            email="admin@gimnasio.com",
            password_hash=hash_password("admin1234"),
            role="superadmin",
            active=True,
        ))

    db.commit()
    db.close()
    print("Base de datos inicializada.")
