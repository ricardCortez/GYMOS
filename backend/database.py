"""
GymOS - Capa de Base de Datos: SQLAlchemy + SQLite
"""
from sqlalchemy import (create_engine, Column, String, Float, Integer,
                        Boolean, Text, DateTime, ForeignKey, LargeBinary)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from sqlalchemy.sql import func
import os, json, uuid

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH  = os.path.join(BASE_DIR, "..", "data", "gymOS.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

engine       = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base         = declarative_base()

class Plan(Base):
    __tablename__ = "plans"
    id         = Column(String,  primary_key=True, default=lambda: str(uuid.uuid4()))
    name       = Column(String,  nullable=False)
    price      = Column(Float,   default=0)
    duration   = Column(Integer, default=30)
    icon       = Column(String,  default="💪")
    color      = Column(String,  default="#ff4500")
    features   = Column(Text,    default="[]")
    featured   = Column(Boolean, default=False)
    active     = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    memberships = relationship("Membership", back_populates="plan")

class Member(Base):
    __tablename__ = "members"
    id                = Column(String,  primary_key=True, default=lambda: str(uuid.uuid4()))
    name              = Column(String,  nullable=False)
    email             = Column(String,  default="")
    phone             = Column(String,  default="")
    document_id       = Column(String,  default="")
    birth_date        = Column(String,  default="")
    address           = Column(String,  default="")
    emergency_contact = Column(String,  default="")
    notes             = Column(Text,    default="")
    avatar            = Column(Text,    default="")
    join_date         = Column(String,  default="")
    active            = Column(Boolean, default=True)
    face_registered   = Column(Boolean,     default=False)
    face_embedding    = Column(LargeBinary, nullable=True)
    face_samples      = Column(Integer,     default=0)
    credential_id     = Column(String,  nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    memberships = relationship("Membership", back_populates="member")
    attendance  = relationship("Attendance",  back_populates="member")
    payments    = relationship("Payment",     back_populates="member")

class Membership(Base):
    __tablename__ = "memberships"
    id         = Column(String,  primary_key=True, default=lambda: str(uuid.uuid4()))
    member_id  = Column(String,  ForeignKey("members.id"), nullable=False)
    plan_id    = Column(String,  ForeignKey("plans.id"),   nullable=False)
    start_date = Column(String,  nullable=False)
    end_date   = Column(String,  nullable=False)
    paid       = Column(Boolean, default=True)
    amount     = Column(Float,   default=0)
    notes      = Column(Text,    default="")
    created_at = Column(DateTime, server_default=func.now())
    member = relationship("Member", back_populates="memberships")
    plan   = relationship("Plan",   back_populates="memberships")

class Attendance(Base):
    __tablename__ = "attendance"
    id         = Column(String,  primary_key=True, default=lambda: str(uuid.uuid4()))
    member_id  = Column(String,  ForeignKey("members.id"), nullable=False)
    check_in   = Column(DateTime, server_default=func.now())
    check_out  = Column(DateTime, nullable=True)
    method     = Column(String,  default="manual")
    confidence = Column(Float,   nullable=True)
    notes      = Column(Text,    default="")
    member = relationship("Member", back_populates="attendance")

class Payment(Base):
    __tablename__ = "payments"
    id         = Column(String,  primary_key=True, default=lambda: str(uuid.uuid4()))
    member_id  = Column(String,  ForeignKey("members.id"), nullable=False)
    concept    = Column(String,  default="")
    amount     = Column(Float,   default=0)
    date       = Column(String,  nullable=False)
    method     = Column(String,  default="Efectivo")
    status     = Column(String,  default="pagado")
    reference  = Column(String,  default="")
    notes      = Column(Text,    default="")
    created_at = Column(DateTime, server_default=func.now())
    member = relationship("Member", back_populates="payments")

class Announcement(Base):
    __tablename__ = "announcements"
    id     = Column(String,  primary_key=True, default=lambda: str(uuid.uuid4()))
    text   = Column(Text,    nullable=False)
    time   = Column(String,  nullable=False)
    days   = Column(String,  default="[]")
    active = Column(Boolean, default=True)

class Setting(Base):
    __tablename__ = "settings"
    key   = Column(String, primary_key=True)
    value = Column(Text,   default="")



class AdminUser(Base):
    __tablename__ = "admin_users"
    id           = Column(String,  primary_key=True, default=lambda: str(uuid.uuid4()))
    username     = Column(String,  unique=True, nullable=False)
    display_name = Column(String,  default="")
    email        = Column(String,  default="")
    password_hash= Column(String,  nullable=False)
    role         = Column(String,  default="recepcion")  # superadmin|admin|recepcion|visualizador
    avatar       = Column(Text,    default="")
    active       = Column(Boolean, default=True)
    last_login   = Column(DateTime, nullable=True)
    created_at   = Column(DateTime, server_default=func.now())
    created_by   = Column(String,  nullable=True)

class AudioAnnouncement(Base):
    __tablename__ = "audio_announcements"
    id           = Column(String,  primary_key=True, default=lambda: str(uuid.uuid4()))
    name         = Column(String,  nullable=False)
    filename     = Column(String,  nullable=False)
    size_kb      = Column(Integer, default=0)
    created_at   = Column(DateTime, server_default=func.now())

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def _migrate_db():
    """
    Migración automática: agrega columnas nuevas a tablas existentes.
    SQLite no soporta ALTER TABLE fácilmente, así que lo hacemos manualmente.
    """
    import sqlite3
    conn = sqlite3.connect(DB_PATH)
    cur  = conn.cursor()

    def add_column_if_missing(table, column, col_type, default=None):
        try:
            cur.execute(f"SELECT {column} FROM {table} LIMIT 1")
        except sqlite3.OperationalError:
            default_clause = f" DEFAULT {default}" if default is not None else ""
            cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}{default_clause}")
            print(f"  [migración] {table}.{column} agregada")

    # plans
    add_column_if_missing("plans",   "color",       "TEXT",    "'#ff4500'")
    # members
    add_column_if_missing("members", "updated_at",  "DATETIME")
    add_column_if_missing("members", "credential_id","TEXT")
    # attendance
    add_column_if_missing("attendance", "confidence", "REAL")
    add_column_if_missing("attendance", "notes",      "TEXT", "''")
    # payments
    add_column_if_missing("payments", "reference",   "TEXT", "''")
    # admin_users (por si ya existe sin algunos campos)
    try:
        add_column_if_missing("admin_users", "avatar",      "TEXT",    "''")
        add_column_if_missing("admin_users", "last_login",  "DATETIME")
        add_column_if_missing("admin_users", "created_by",  "TEXT")
    except Exception:
        pass
    # audio_announcements
    try:
        add_column_if_missing("audio_announcements", "size_kb", "INTEGER", "0")
    except Exception:
        pass

    conn.commit()
    conn.close()


def init_db():
    Base.metadata.create_all(bind=engine)
    # Migrar columnas nuevas en tablas existentes
    try:
        _migrate_db()
    except Exception as e:
        print(f"  [migración] advertencia: {e}")
    db = SessionLocal()
    for k, v in {
        "gymName":"Mi Gimnasio","currency":"S/","openTime":"06:00",
        "closeTime":"22:00","faceThreshold":"0.45","checkinCooldown":"3600",
        "timezone":"-5","togWelcome":"true","togRenew":"true","togOpen":"true","togClose":"true",
    }.items():
        if not db.query(Setting).filter_by(key=k).first():
            db.add(Setting(key=k, value=v))
    if not db.query(Plan).first():
        db.add_all([
            Plan(id=str(uuid.uuid4()), name="Basico",  price=59,  duration=30,  icon="💪",
                 features=json.dumps(["Sala de pesas","Horario estandar","Casillero"])),
            Plan(id=str(uuid.uuid4()), name="Premium", price=99,  duration=30,  icon="🔥",
                 features=json.dumps(["Acceso total","Clases grupales","Sauna","Nutricionista"]), featured=True),
            Plan(id=str(uuid.uuid4()), name="Anual",   price=799, duration=365, icon="⭐",
                 features=json.dumps(["Todo Premium","Sin matricula"])),
        ])
    if not db.query(Announcement).first():
        db.add_all([
            Announcement(id=str(uuid.uuid4()),
                text="Buenos dias! El gimnasio esta abierto. A entrenar con todo!",
                time="06:00", days=json.dumps(["lun","mar","mié","jue","vie"])),
            Announcement(id=str(uuid.uuid4()),
                text="El gimnasio cerrara en 30 minutos. Gracias por entrenar con nosotros.",
                time="21:30", days=json.dumps(["lun","mar","mié","jue","vie","sáb","dom"])),
        ])
    # Default superadmin
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