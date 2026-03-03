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
    features   = Column(Text,    default="[]")   # JSON list
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
    document_id       = Column(String,  default="")   # DNI
    birth_date        = Column(String,  default="")
    address           = Column(String,  default="")
    emergency_contact = Column(String,  default="")
    notes             = Column(Text,    default="")
    avatar            = Column(Text,    default="")   # base64 JPEG
    join_date         = Column(String,  default="")
    active            = Column(Boolean, default=True)
    # Reconocimiento Facial
    face_registered   = Column(Boolean,     default=False)
    face_embedding    = Column(LargeBinary, nullable=True)  # numpy float32 bytes
    face_samples      = Column(Integer,     default=0)
    # Huella (WebAuthn)
    credential_id     = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
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
    method     = Column(String,  default="manual")  # facial|fingerprint|manual
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

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    for k, v in {
        "gymName":"Mi Gimnasio","currency":"S/","openTime":"06:00",
        "closeTime":"22:00","faceThreshold":"0.45","checkinCooldown":"3600"
    }.items():
        if not db.query(Setting).filter_by(key=k).first():
            db.add(Setting(key=k, value=v))
    if not db.query(Plan).first():
        db.add_all([
            Plan(name="Basico",  price=59,  duration=30,  icon="💪",
                 features=json.dumps(["Sala de pesas","Horario estandar","Casillero"])),
            Plan(name="Premium", price=99,  duration=30,  icon="🔥",
                 features=json.dumps(["Acceso total","Clases grupales","Sauna"]), featured=True),
            Plan(name="Anual",   price=799, duration=365, icon="⭐",
                 features=json.dumps(["Todo Premium","Sin matricula"])),
        ])
    db.commit()
    db.close()