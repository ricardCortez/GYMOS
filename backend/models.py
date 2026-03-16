"""
GymOS - Modelos ORM (SQLAlchemy)

Responsabilidad ÚNICA: definir la estructura de las tablas.
El engine, sesión e inicialización están en database.py.
"""
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Float, Integer, Boolean, Text,
    DateTime, ForeignKey, LargeBinary, Index,
)
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.sql import func
import uuid, json

Base = declarative_base()


# ── Planes de membresía ───────────────────────────────────────
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


# ── Miembros ──────────────────────────────────────────────────
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
    # Reconocimiento facial
    face_registered   = Column(Boolean,     default=False)
    face_embedding    = Column(LargeBinary, nullable=True)
    face_samples      = Column(Integer,     default=0)
    # Autenticación biométrica (WebAuthn)
    credential_id     = Column(String,  nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    memberships = relationship("Membership", back_populates="member")
    attendance  = relationship("Attendance",  back_populates="member")
    payments    = relationship("Payment",     back_populates="member")


# ── Membresías ────────────────────────────────────────────────
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
    __table_args__ = (
        Index("ix_memberships_member_id", "member_id"),
        Index("ix_memberships_end_date",  "end_date"),
    )


# ── Asistencia ────────────────────────────────────────────────
class Attendance(Base):
    __tablename__ = "attendance"
    id         = Column(String,  primary_key=True, default=lambda: str(uuid.uuid4()))
    member_id  = Column(String,  ForeignKey("members.id"), nullable=False)
    check_in   = Column(DateTime, server_default=func.now())
    check_out  = Column(DateTime, nullable=True)
    method     = Column(String,  default="manual")   # facial|fingerprint|manual|qr
    confidence = Column(Float,   nullable=True)
    notes      = Column(Text,    default="")
    member = relationship("Member", back_populates="attendance")
    __table_args__ = (
        Index("ix_attendance_member_id", "member_id"),
        Index("ix_attendance_check_in",  "check_in"),
    )


# ── Pagos ─────────────────────────────────────────────────────
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


# ── Anuncios programados ──────────────────────────────────────
class Announcement(Base):
    __tablename__ = "announcements"
    id     = Column(String,  primary_key=True, default=lambda: str(uuid.uuid4()))
    text   = Column(Text,    nullable=False)
    time   = Column(String,  nullable=False)   # HH:MM
    days   = Column(String,  default="[]")     # JSON array ["lun","mar",...]
    active = Column(Boolean, default=True)


# ── Configuración del sistema ─────────────────────────────────
class Setting(Base):
    __tablename__ = "settings"
    key   = Column(String, primary_key=True)
    value = Column(Text,   default="")


# ── Promociones ───────────────────────────────────────────────
class Promotion(Base):
    """
    Promociones por tiempo limitado aplicables a planes de membresía.

    discount_type : 'percent' → porcentual (ej: 20 %)
                    'fixed'   → monto fijo  (ej: S/30)
    applies_to    : JSON array de plan IDs. Vacío = aplica a todos los planes.
    uses_limit    : 0 = ilimitado. >0 = se desactiva al llegar a ese número.
    """
    __tablename__  = "promotions"
    id             = Column(String,  primary_key=True, default=lambda: str(uuid.uuid4()))
    name           = Column(String,  nullable=False)
    description    = Column(String,  default="")
    code           = Column(String,  default="")
    discount_type  = Column(String,  default="percent")
    discount_value = Column(Float,   default=0.0)
    applies_to     = Column(String,  default="[]")   # JSON array de plan IDs
    start_date     = Column(String,  nullable=False)
    end_date       = Column(String,  nullable=False)
    start_time     = Column(String,  default="00:00")
    end_time       = Column(String,  default="23:59")
    uses_limit     = Column(Integer, default=0)
    uses_count     = Column(Integer, default=0)
    active         = Column(Boolean, default=True)
    created_at     = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# ── Usuarios administradores ──────────────────────────────────
class AdminUser(Base):
    __tablename__ = "admin_users"
    id           = Column(String,  primary_key=True, default=lambda: str(uuid.uuid4()))
    username     = Column(String,  unique=True, nullable=False)
    display_name = Column(String,  default="")
    email        = Column(String,  default="")
    password_hash = Column(String, nullable=False)
    role         = Column(String,  default="recepcion")  # superadmin|admin|recepcion|visualizador
    avatar       = Column(Text,    default="")
    active       = Column(Boolean, default=True)
    last_login   = Column(DateTime, nullable=True)
    created_at   = Column(DateTime, server_default=func.now())
    created_by   = Column(String,  nullable=True)


# ── Archivos de audio para anuncios ──────────────────────────
class AudioAnnouncement(Base):
    __tablename__ = "audio_announcements"
    id         = Column(String,  primary_key=True, default=lambda: str(uuid.uuid4()))
    name       = Column(String,  nullable=False)
    filename   = Column(String,  nullable=False)
    size_kb    = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
