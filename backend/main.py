"""
GymOS - API Principal FastAPI
Corre en: uvicorn backend.main:app --host 0.0.0.0 --port 8000
"""
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime, timedelta
import json, uuid, os, base64

from .database import get_db, init_db, Member, Plan, Membership, Attendance, Payment, Announcement, Setting
from .face_service import face_service

app = FastAPI(title="GymOS API", version="1.0.0")

# CORS: permite peticiones desde el frontend en la misma red local
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")

@app.on_event("startup")
async def startup():
    init_db()
    # Inicializar InsightFace
    ok = face_service.initialize()
    if ok:
        # Cargar todos los embeddings en cache
        db = next(get_db())
        members = db.query(Member).filter_by(face_registered=True).all()
        face_service.load_all([{"id": m.id, "face_embedding": m.face_embedding} for m in members])
        db.close()
    print(f"GymOS iniciado. Face recognition: {'OK' if ok else 'NO DISPONIBLE'}")

@app.get("/")
def serve_frontend():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

# ════════════════════════════════════════════════════════
#  PLANES
# ════════════════════════════════════════════════════════

@app.get("/api/plans")
def get_plans(db: Session = Depends(get_db)):
    plans = db.query(Plan).filter_by(active=True).all()
    return [_plan_dict(p) for p in plans]

@app.post("/api/plans")
def create_plan(data: dict = Body(...), db: Session = Depends(get_db)):
    p = Plan(id=str(uuid.uuid4()), **{k: v for k, v in data.items() if k != "id"})
    if isinstance(p.features, list):
        p.features = json.dumps(p.features)
    db.add(p); db.commit(); db.refresh(p)
    return _plan_dict(p)

@app.put("/api/plans/{plan_id}")
def update_plan(plan_id: str, data: dict = Body(...), db: Session = Depends(get_db)):
    p = db.query(Plan).get(plan_id)
    if not p:
        raise HTTPException(404, "Plan no encontrado")
    for k, v in data.items():
        if k == "features" and isinstance(v, list):
            v = json.dumps(v)
        if hasattr(p, k):
            setattr(p, k, v)
    db.commit(); return _plan_dict(p)

@app.delete("/api/plans/{plan_id}")
def delete_plan(plan_id: str, db: Session = Depends(get_db)):
    p = db.query(Plan).get(plan_id)
    if p:
        p.active = False; db.commit()
    return {"ok": True}

def _plan_dict(p: Plan) -> dict:
    return {
        "id": p.id, "name": p.name, "price": p.price,
        "duration": p.duration, "icon": p.icon, "color": p.color,
        "features": json.loads(p.features) if isinstance(p.features, str) else p.features,
        "featured": p.featured, "active": p.active,
    }

# ════════════════════════════════════════════════════════
#  MIEMBROS
# ════════════════════════════════════════════════════════

@app.get("/api/members")
def get_members(db: Session = Depends(get_db)):
    members = db.query(Member).filter_by(active=True).all()
    return [_member_dict(m) for m in members]

@app.get("/api/members/{member_id}")
def get_member(member_id: str, db: Session = Depends(get_db)):
    m = db.query(Member).get(member_id)
    if not m:
        raise HTTPException(404, "Miembro no encontrado")
    return _member_dict(m, include_embedding=False)

@app.post("/api/members")
def create_member(data: dict = Body(...), db: Session = Depends(get_db)):
    m = Member(
        id=str(uuid.uuid4()),
        join_date=str(date.today()),
        **{k: v for k, v in data.items() if k not in ("id","face_embedding","face_registered","face_samples")}
    )
    db.add(m); db.commit(); db.refresh(m)
    return _member_dict(m)

@app.put("/api/members/{member_id}")
def update_member(member_id: str, data: dict = Body(...), db: Session = Depends(get_db)):
    m = db.query(Member).get(member_id)
    if not m:
        raise HTTPException(404)
    skip = {"id","face_embedding","face_registered","face_samples","credential_id","created_at"}
    for k, v in data.items():
        if k not in skip and hasattr(m, k):
            setattr(m, k, v)
    db.commit(); return _member_dict(m)

@app.delete("/api/members/{member_id}")
def delete_member(member_id: str, db: Session = Depends(get_db)):
    m = db.query(Member).get(member_id)
    if m:
        m.active = False
        face_service.remove(member_id)
        db.commit()
    return {"ok": True}

def _member_dict(m: Member, include_embedding=False) -> dict:
    d = {
        "id": m.id, "name": m.name, "email": m.email, "phone": m.phone,
        "document_id": m.document_id, "birth_date": m.birth_date,
        "address": m.address, "emergency_contact": m.emergency_contact,
        "notes": m.notes, "avatar": m.avatar, "join_date": m.join_date,
        "active": m.active, "face_registered": m.face_registered,
        "face_samples": m.face_samples,
        "has_fingerprint": bool(m.credential_id),
        "created_at": str(m.created_at),
    }
    return d

# ════════════════════════════════════════════════════════
#  RECONOCIMIENTO FACIAL
# ════════════════════════════════════════════════════════

class RegisterFaceRequest(BaseModel):
    member_id: str
    images: List[str]          # lista de base64 (3-5 fotos desde el frontend)

class IdentifyRequest(BaseModel):
    image: str                 # base64 del frame de la cámara

@app.post("/api/face/register")
def register_face(req: RegisterFaceRequest, db: Session = Depends(get_db)):
    """
    Registra el rostro de un miembro.
    El frontend envía 3-5 fotos capturadas durante el registro.
    InsightFace extrae el embedding de cada una y guarda el promedio en la DB.
    """
    if not face_service.ready:
        raise HTTPException(503, "Servicio de reconocimiento facial no disponible")

    m = db.query(Member).get(req.member_id)
    if not m:
        raise HTTPException(404, "Miembro no encontrado")

    existing = m.face_embedding  # combinar con muestras previas si las hay

    emb_bytes, n_samples, msg = face_service.register(
        member_id=req.member_id,
        images=req.images,
        existing=existing
    )

    if emb_bytes is None:
        raise HTTPException(400, msg)

    m.face_embedding  = emb_bytes
    m.face_registered = True
    m.face_samples    = (m.face_samples or 0) + n_samples
    db.commit()

    return {
        "ok": True,
        "member_id": req.member_id,
        "samples": m.face_samples,
        "message": msg,
    }

@app.post("/api/face/identify")
def identify_face(req: IdentifyRequest, db: Session = Depends(get_db)):
    """
    Identifica un rostro en un frame de la cámara.
    Retorna el miembro reconocido + info de asistencia o None.
    """
    if not face_service.ready:
        return {"identified": False, "reason": "Modelo no disponible"}

    result = face_service.identify(req.image)
    if result is None:
        return {"identified": False, "reason": "No reconocido"}

    member_id, confidence = result
    m = db.query(Member).get(member_id)
    if not m:
        return {"identified": False, "reason": "Miembro no encontrado en DB"}

    # Info de membresía activa
    today = str(date.today())
    ms = (db.query(Membership)
            .filter_by(member_id=member_id)
            .filter(Membership.end_date >= today)
            .order_by(Membership.end_date.desc())
            .first())

    plan = db.query(Plan).get(ms.plan_id) if ms else None

    return {
        "identified": True,
        "member_id": member_id,
        "confidence": confidence,
        "member": {
            "id": m.id, "name": m.name,
            "avatar": m.avatar,
            "plan": plan.name if plan else "Sin plan",
            "membership_active": bool(ms),
            "days_left": (datetime.strptime(ms.end_date, "%Y-%m-%d").date() - date.today()).days if ms else 0,
        }
    }

@app.post("/api/face/status")
def face_status():
    return {
        "available": face_service.ready,
        "registered_count": len(face_service._cache),
        "threshold": face_service.threshold,
    }

# ════════════════════════════════════════════════════════
#  ASISTENCIA
# ════════════════════════════════════════════════════════

class CheckinRequest(BaseModel):
    member_id: str
    method: str = "manual"
    confidence: Optional[float] = None
    notes: str = ""

@app.post("/api/attendance/checkin")
def checkin(req: CheckinRequest, db: Session = Depends(get_db)):
    # Evitar doble checkin (cooldown configurable)
    setting = db.query(Setting).get("checkinCooldown")
    cooldown = int(setting.value) if setting else 3600
    cutoff = datetime.now() - timedelta(seconds=cooldown)
    recent = (db.query(Attendance)
              .filter_by(member_id=req.member_id)
              .filter(Attendance.check_in >= cutoff)
              .first())
    if recent:
        return {"ok": False, "reason": "Cooldown activo", "next_allowed": str(cutoff + timedelta(seconds=cooldown))}

    a = Attendance(
        id=str(uuid.uuid4()),
        member_id=req.member_id,
        method=req.method,
        confidence=req.confidence,
        notes=req.notes,
    )
    db.add(a); db.commit()

    m = db.query(Member).get(req.member_id)
    return {"ok": True, "attendance_id": a.id, "member_name": m.name if m else ""}

@app.get("/api/attendance/today")
def today_attendance(db: Session = Depends(get_db)):
    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    records = (db.query(Attendance)
               .filter(Attendance.check_in >= today_start)
               .order_by(Attendance.check_in.desc())
               .all())
    result = []
    for a in records:
        m = db.query(Member).get(a.member_id)
        ms = (db.query(Membership).filter_by(member_id=a.member_id)
              .order_by(Membership.end_date.desc()).first())
        plan = db.query(Plan).get(ms.plan_id) if ms else None
        result.append({
            "id": a.id,
            "member_id": a.member_id,
            "member_name": m.name if m else "?",
            "member_avatar": m.avatar if m else "",
            "plan": plan.name if plan else "—",
            "check_in": str(a.check_in),
            "method": a.method,
            "confidence": a.confidence,
        })
    return result

@app.get("/api/attendance/stats")
def attendance_stats(days: int = 30, db: Session = Depends(get_db)):
    cutoff = datetime.now() - timedelta(days=days)
    records = db.query(Attendance).filter(Attendance.check_in >= cutoff).all()
    by_day = {}
    for a in records:
        d = a.check_in.strftime("%Y-%m-%d")
        by_day[d] = by_day.get(d, 0) + 1
    return by_day

# ════════════════════════════════════════════════════════
#  MEMBRESÍAS
# ════════════════════════════════════════════════════════

@app.get("/api/memberships")
def get_memberships(active_only: bool = False, db: Session = Depends(get_db)):
    q = db.query(Membership)
    if active_only:
        q = q.filter(Membership.end_date >= str(date.today()))
    ms_list = q.order_by(Membership.end_date.desc()).all()
    return [_ms_dict(ms, db) for ms in ms_list]

@app.post("/api/memberships")
def create_membership(data: dict = Body(...), db: Session = Depends(get_db)):
    plan = db.query(Plan).get(data["plan_id"])
    if not plan:
        raise HTTPException(404, "Plan no encontrado")
    start = data.get("start_date", str(date.today()))
    end_dt = datetime.strptime(start, "%Y-%m-%d") + timedelta(days=plan.duration)
    ms = Membership(
        id=str(uuid.uuid4()),
        member_id=data["member_id"],
        plan_id=data["plan_id"],
        start_date=start,
        end_date=end_dt.strftime("%Y-%m-%d"),
        amount=data.get("amount", plan.price),
        notes=data.get("notes", ""),
    )
    db.add(ms)
    # Registrar pago automático
    pay = Payment(
        id=str(uuid.uuid4()),
        member_id=data["member_id"],
        concept=f"Membresía {plan.name}",
        amount=ms.amount,
        date=start,
        method=data.get("payment_method", "Efectivo"),
        status="pagado",
    )
    db.add(pay)
    db.commit()
    return _ms_dict(ms, db)

@app.put("/api/memberships/{ms_id}/renew")
def renew_membership(ms_id: str, data: dict = Body(...), db: Session = Depends(get_db)):
    ms = db.query(Membership).get(ms_id)
    if not ms:
        raise HTTPException(404)
    plan = db.query(Plan).get(data.get("plan_id", ms.plan_id))
    start = data.get("start_date", str(date.today()))
    end_dt = datetime.strptime(start, "%Y-%m-%d") + timedelta(days=plan.duration)
    ms.plan_id    = plan.id
    ms.start_date = start
    ms.end_date   = end_dt.strftime("%Y-%m-%d")
    ms.amount     = data.get("amount", plan.price)
    pay = Payment(
        id=str(uuid.uuid4()),
        member_id=ms.member_id,
        concept=f"Renovación {plan.name}",
        amount=ms.amount,
        date=start,
        method=data.get("payment_method", "Efectivo"),
        status="pagado",
    )
    db.add(pay); db.commit()
    return _ms_dict(ms, db)

def _ms_dict(ms: Membership, db) -> dict:
    m    = db.query(Member).get(ms.member_id)
    plan = db.query(Plan).get(ms.plan_id)
    today = date.today()
    end   = datetime.strptime(ms.end_date, "%Y-%m-%d").date()
    return {
        "id": ms.id,
        "member_id": ms.member_id,
        "member_name": m.name if m else "?",
        "plan_id": ms.plan_id,
        "plan_name": plan.name if plan else "?",
        "start_date": ms.start_date,
        "end_date": ms.end_date,
        "days_left": (end - today).days,
        "active": end >= today,
        "amount": ms.amount,
        "notes": ms.notes,
    }

# ════════════════════════════════════════════════════════
#  PAGOS
# ════════════════════════════════════════════════════════

@app.get("/api/payments")
def get_payments(db: Session = Depends(get_db)):
    pays = db.query(Payment).order_by(Payment.created_at.desc()).all()
    return [_pay_dict(p, db) for p in pays]

@app.post("/api/payments")
def create_payment(data: dict = Body(...), db: Session = Depends(get_db)):
    p = Payment(id=str(uuid.uuid4()), **{k: v for k, v in data.items() if k != "id"})
    db.add(p); db.commit()
    return _pay_dict(p, db)

def _pay_dict(p: Payment, db) -> dict:
    m = db.query(Member).get(p.member_id)
    return {
        "id": p.id, "member_id": p.member_id,
        "member_name": m.name if m else "?",
        "concept": p.concept, "amount": p.amount,
        "date": p.date, "method": p.method,
        "status": p.status, "notes": p.notes,
    }

# ════════════════════════════════════════════════════════
#  ANUNCIOS
# ════════════════════════════════════════════════════════

@app.get("/api/announcements")
def get_announcements(db: Session = Depends(get_db)):
    anns = db.query(Announcement).all()
    return [{"id": a.id, "text": a.text, "time": a.time,
             "days": json.loads(a.days), "active": a.active} for a in anns]

@app.post("/api/announcements")
def create_announcement(data: dict = Body(...), db: Session = Depends(get_db)):
    a = Announcement(id=str(uuid.uuid4()), text=data["text"], time=data["time"],
                     days=json.dumps(data.get("days", [])), active=data.get("active", True))
    db.add(a); db.commit()
    return {"id": a.id}

@app.put("/api/announcements/{ann_id}")
def update_announcement(ann_id: str, data: dict = Body(...), db: Session = Depends(get_db)):
    a = db.query(Announcement).get(ann_id)
    if not a:
        raise HTTPException(404)
    if "text" in data:    a.text   = data["text"]
    if "time" in data:    a.time   = data["time"]
    if "days" in data:    a.days   = json.dumps(data["days"])
    if "active" in data:  a.active = data["active"]
    db.commit(); return {"ok": True}

@app.delete("/api/announcements/{ann_id}")
def delete_announcement(ann_id: str, db: Session = Depends(get_db)):
    a = db.query(Announcement).get(ann_id)
    if a:
        db.delete(a); db.commit()
    return {"ok": True}

# ════════════════════════════════════════════════════════
#  CONFIGURACIÓN
# ════════════════════════════════════════════════════════

@app.get("/api/settings")
def get_settings(db: Session = Depends(get_db)):
    settings = db.query(Setting).all()
    return {s.key: s.value for s in settings}

@app.put("/api/settings")
def update_settings(data: dict = Body(...), db: Session = Depends(get_db)):
    for k, v in data.items():
        s = db.query(Setting).get(k)
        if s:
            s.value = str(v)
        else:
            db.add(Setting(key=k, value=str(v)))
    # Actualizar threshold del face_service en caliente
    if "faceThreshold" in data:
        face_service.set_threshold(float(data["faceThreshold"]))
    db.commit()
    return {"ok": True}

# ════════════════════════════════════════════════════════
#  DASHBOARD STATS
# ════════════════════════════════════════════════════════

@app.get("/api/dashboard")
def dashboard_stats(db: Session = Depends(get_db)):
    today = str(date.today())
    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    total_members  = db.query(Member).filter_by(active=True).count()
    today_checkins = db.query(Attendance).filter(Attendance.check_in >= today_start).count()
    active_ms      = db.query(Membership).filter(Membership.end_date >= today).count()
    month_revenue  = sum(p.amount for p in db.query(Payment)
                         .filter(Payment.created_at >= month_start).all())

    # Vencen en 7 días
    week_later = str(date.today() + timedelta(days=7))
    expiring   = (db.query(Membership)
                  .filter(Membership.end_date >= today)
                  .filter(Membership.end_date <= week_later)
                  .count())

    # Miembros con reconocimiento registrado
    face_registered = db.query(Member).filter_by(face_registered=True, active=True).count()

    return {
        "total_members":   total_members,
        "today_checkins":  today_checkins,
        "active_ms":       active_ms,
        "month_revenue":   month_revenue,
        "expiring_soon":   expiring,
        "face_registered": face_registered,
    }