"""
GymOS - API Principal FastAPI
Arrancar: python run.py  (o: uvicorn backend.main:app --host 0.0.0.0 --port 8000)
"""
from fastapi import FastAPI, Depends, HTTPException, Body, Form, UploadFile, File, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime, timedelta
import json, uuid, os

from .database import (get_db, init_db, Member, Plan, Membership,
                        Attendance, Payment, Announcement, Setting)
from .face_service import face_service

app = FastAPI(title="GymOS API", version="1.0.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")

# ─── STARTUP ──────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    init_db()
    ok = face_service.initialize()
    if ok:
        db = next(get_db())
        members = db.query(Member).filter_by(face_registered=True, active=True).all()
        face_service.load_all([{"id": m.id, "face_embedding": m.face_embedding} for m in members])
        db.close()
    print(f"GymOS API iniciada | Face recognition: {'OK' if ok else 'NO DISPONIBLE (instala insightface)'}")

@app.get("/")
def serve_index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

app.mount("/assets", StaticFiles(directory=FRONTEND_DIR), name="static")

# ─── PLANS ────────────────────────────────────────────────────
@app.get("/api/plans")
def get_plans(db: Session = Depends(get_db)):
    return [_plan(p) for p in db.query(Plan).filter_by(active=True).all()]

@app.post("/api/plans")
def create_plan(data: dict = Body(...), db: Session = Depends(get_db)):
    p = Plan(id=str(uuid.uuid4()))
    for k, v in data.items():
        if k == "features" and isinstance(v, list): v = json.dumps(v)
        if hasattr(p, k) and k != "id": setattr(p, k, v)
    db.add(p); db.commit(); db.refresh(p); return _plan(p)

@app.put("/api/plans/{pid}")
def update_plan(pid: str, data: dict = Body(...), db: Session = Depends(get_db)):
    p = db.query(Plan).get(pid)
    if not p: raise HTTPException(404)
    for k, v in data.items():
        if k == "features" and isinstance(v, list): v = json.dumps(v)
        if hasattr(p, k) and k != "id": setattr(p, k, v)
    db.commit(); return _plan(p)

@app.delete("/api/plans/{pid}")
def delete_plan(pid: str, db: Session = Depends(get_db)):
    p = db.query(Plan).get(pid)
    if p: p.active = False; db.commit()
    return {"ok": True}

def _plan(p):
    return {"id":p.id,"name":p.name,"price":p.price,"duration":p.duration,
            "icon":p.icon,"color":p.color,"featured":p.featured,"active":p.active,
            "features":json.loads(p.features) if isinstance(p.features,str) else p.features}

# ─── MEMBERS ──────────────────────────────────────────────────
@app.get("/api/members")
def get_members(db: Session = Depends(get_db)):
    return [_member(m) for m in db.query(Member).filter_by(active=True).all()]

@app.get("/api/members/{mid}")
def get_member(mid: str, db: Session = Depends(get_db)):
    m = db.query(Member).get(mid)
    if not m: raise HTTPException(404)
    return _member(m)

@app.post("/api/members")
def create_member(data: dict = Body(...), db: Session = Depends(get_db)):
    skip = {"id","face_embedding","face_registered","face_samples","credential_id"}
    m = Member(id=str(uuid.uuid4()), join_date=str(date.today()))
    for k, v in data.items():
        if k not in skip and hasattr(m, k): setattr(m, k, v)
    db.add(m); db.commit(); db.refresh(m); return _member(m)

@app.put("/api/members/{mid}")
def update_member(mid: str, data: dict = Body(...), db: Session = Depends(get_db)):
    m = db.query(Member).get(mid)
    if not m: raise HTTPException(404)
    skip = {"id","face_embedding","face_registered","face_samples","created_at"}
    for k, v in data.items():
        if k not in skip and hasattr(m, k): setattr(m, k, v)
    db.commit(); return _member(m)

@app.delete("/api/members/{mid}")
def delete_member(mid: str, db: Session = Depends(get_db)):
    m = db.query(Member).get(mid)
    if m: m.active = False; face_service.remove(mid); db.commit()
    return {"ok": True}

def _member(m):
    return {"id":m.id,"name":m.name,"email":m.email,"phone":m.phone,
            "document_id":m.document_id,"birth_date":m.birth_date,
            "address":m.address,"emergency_contact":m.emergency_contact,
            "notes":m.notes,"avatar":m.avatar,"join_date":m.join_date,
            "active":m.active,"face_registered":m.face_registered,
            "face_samples":m.face_samples,"has_fingerprint":bool(m.credential_id),
            "credential_id":m.credential_id,"created_at":str(m.created_at)}

# ─── FACE ─────────────────────────────────────────────────────
class RegisterFaceReq(BaseModel):
    member_id: str
    images: List[str]

class IdentifyReq(BaseModel):
    image: str

@app.post("/api/face/register")
def register_face(req: RegisterFaceReq, db: Session = Depends(get_db)):
    if not face_service.ready:
        raise HTTPException(503, "Servicio de reconocimiento facial no disponible. Instala insightface.")
    m = db.query(Member).get(req.member_id)
    if not m: raise HTTPException(404, "Miembro no encontrado")
    emb_bytes, n, msg = face_service.register(req.member_id, req.images, m.face_embedding)
    if emb_bytes is None: raise HTTPException(400, msg)
    m.face_embedding  = emb_bytes
    m.face_registered = True
    m.face_samples    = (m.face_samples or 0) + n
    db.commit()
    return {"ok": True, "member_id": req.member_id, "samples": m.face_samples, "message": msg}

@app.post("/api/face/identify")
def identify_face(req: IdentifyReq, db: Session = Depends(get_db)):
    if not face_service.ready:
        return {"identified": False, "reason": "Modelo no disponible"}
    result = face_service.identify(req.image)
    if result is None:
        return {"identified": False, "reason": "No reconocido"}
    member_id, confidence = result
    m = db.query(Member).get(member_id)
    if not m: return {"identified": False, "reason": "Miembro no en DB"}
    today = str(date.today())
    ms = (db.query(Membership).filter_by(member_id=member_id)
          .filter(Membership.end_date >= today)
          .order_by(Membership.end_date.desc()).first())
    plan = db.query(Plan).get(ms.plan_id) if ms else None
    return {
        "identified": True, "member_id": member_id, "confidence": confidence,
        "member": {
            "id": m.id, "name": m.name, "avatar": m.avatar,
            "plan": plan.name if plan else "Sin plan",
            "membership_active": bool(ms),
            "days_left": (datetime.strptime(ms.end_date,"%Y-%m-%d").date()-date.today()).days if ms else 0,
        }
    }

@app.post("/api/face/status")
def face_status():
    return {"available": face_service.ready, "registered_count": len(face_service._cache), "threshold": face_service.threshold}

# ─── ATTENDANCE ───────────────────────────────────────────────
class CheckinReq(BaseModel):
    member_id: str
    method: str = "manual"
    confidence: Optional[float] = None
    notes: str = ""

@app.post("/api/attendance/checkin")
def checkin(req: CheckinReq, db: Session = Depends(get_db)):
    s = db.query(Setting).get("checkinCooldown")
    cooldown = int(s.value) if s else 3600
    cutoff = datetime.now() - timedelta(seconds=cooldown)
    recent = (db.query(Attendance).filter_by(member_id=req.member_id)
              .filter(Attendance.check_in >= cutoff).first())
    if recent:
        return {"ok": False, "reason": "Cooldown activo"}
    a = Attendance(id=str(uuid.uuid4()), member_id=req.member_id,
                   method=req.method, confidence=req.confidence, notes=req.notes)
    db.add(a); db.commit()
    m = db.query(Member).get(req.member_id)
    return {"ok": True, "attendance_id": a.id, "member_name": m.name if m else ""}

@app.get("/api/attendance/today")
def today_att(db: Session = Depends(get_db)):
    today_start = datetime.now().replace(hour=0,minute=0,second=0,microsecond=0)
    recs = (db.query(Attendance).filter(Attendance.check_in >= today_start)
            .order_by(Attendance.check_in.desc()).all())
    result = []
    for a in recs:
        m  = db.query(Member).get(a.member_id)
        ms = (db.query(Membership).filter_by(member_id=a.member_id)
              .order_by(Membership.end_date.desc()).first())
        pl = db.query(Plan).get(ms.plan_id) if ms else None
        result.append({"id":a.id,"member_id":a.member_id,
                        "member_name":m.name if m else "?",
                        "member_avatar":m.avatar if m else "",
                        "plan":pl.name if pl else "—",
                        "check_in":str(a.check_in),"method":a.method,"confidence":a.confidence})
    return result

@app.get("/api/attendance/stats")
def att_stats(days: int = 30, db: Session = Depends(get_db)):
    cutoff = datetime.now() - timedelta(days=days)
    recs = db.query(Attendance).filter(Attendance.check_in >= cutoff).all()
    by_day = {}
    for a in recs:
        d = a.check_in.strftime("%Y-%m-%d")
        by_day[d] = by_day.get(d, 0) + 1
    return by_day

# ─── MEMBERSHIPS ──────────────────────────────────────────────
@app.get("/api/memberships")
def get_memberships(active_only: bool = False, db: Session = Depends(get_db)):
    q = db.query(Membership)
    if active_only: q = q.filter(Membership.end_date >= str(date.today()))
    return [_ms(ms, db) for ms in q.order_by(Membership.end_date.desc()).all()]

@app.post("/api/memberships")
def create_membership(data: dict = Body(...), db: Session = Depends(get_db)):
    plan = db.query(Plan).get(data["plan_id"])
    if not plan: raise HTTPException(404, "Plan no encontrado")
    start   = data.get("start_date", str(date.today()))
    end_dt  = datetime.strptime(start,"%Y-%m-%d") + timedelta(days=plan.duration)
    ms = Membership(id=str(uuid.uuid4()), member_id=data["member_id"], plan_id=plan.id,
                    start_date=start, end_date=end_dt.strftime("%Y-%m-%d"),
                    amount=data.get("amount", plan.price), notes=data.get("notes",""))
    pay = Payment(id=str(uuid.uuid4()), member_id=data["member_id"],
                  concept=f"Membresía {plan.name}", amount=ms.amount,
                  date=start, method=data.get("payment_method","Efectivo"), status="pagado")
    db.add(ms); db.add(pay); db.commit(); return _ms(ms, db)

@app.put("/api/memberships/{msid}/renew")
def renew(msid: str, data: dict = Body(...), db: Session = Depends(get_db)):
    ms = db.query(Membership).get(msid)
    if not ms: raise HTTPException(404)
    plan = db.query(Plan).get(data.get("plan_id", ms.plan_id))
    start  = data.get("start_date", str(date.today()))
    end_dt = datetime.strptime(start,"%Y-%m-%d") + timedelta(days=plan.duration)
    ms.plan_id=plan.id; ms.start_date=start; ms.end_date=end_dt.strftime("%Y-%m-%d")
    ms.amount=data.get("amount", plan.price)
    pay = Payment(id=str(uuid.uuid4()), member_id=ms.member_id,
                  concept=f"Renovación {plan.name}", amount=ms.amount,
                  date=start, method=data.get("payment_method","Efectivo"), status="pagado")
    db.add(pay); db.commit(); return _ms(ms, db)

def _ms(ms, db):
    m    = db.query(Member).get(ms.member_id)
    plan = db.query(Plan).get(ms.plan_id)
    today = date.today()
    end   = datetime.strptime(ms.end_date,"%Y-%m-%d").date()
    return {"id":ms.id,"member_id":ms.member_id,"member_name":m.name if m else "?",
            "plan_id":ms.plan_id,"plan_name":plan.name if plan else "?",
            "start_date":ms.start_date,"end_date":ms.end_date,
            "days_left":(end-today).days,"active":end>=today,"amount":ms.amount,"notes":ms.notes}

# ─── PAYMENTS ─────────────────────────────────────────────────
@app.get("/api/payments")
def get_payments(db: Session = Depends(get_db)):
    return [_pay(p,db) for p in db.query(Payment).order_by(Payment.created_at.desc()).all()]

@app.post("/api/payments")
def create_payment(data: dict = Body(...), db: Session = Depends(get_db)):
    p = Payment(id=str(uuid.uuid4()))
    for k, v in data.items():
        if hasattr(p,k) and k!="id": setattr(p,k,v)
    db.add(p); db.commit(); return _pay(p,db)

def _pay(p,db):
    m = db.query(Member).get(p.member_id)
    return {"id":p.id,"member_id":p.member_id,"member_name":m.name if m else "?",
            "concept":p.concept,"amount":p.amount,"date":p.date,
            "method":p.method,"status":p.status,"notes":p.notes}

# ─── ANNOUNCEMENTS ────────────────────────────────────────────
@app.get("/api/announcements")
def get_ann(db: Session = Depends(get_db)):
    return [{"id":a.id,"text":a.text,"time":a.time,
             "days":json.loads(a.days),"active":a.active}
            for a in db.query(Announcement).all()]

@app.post("/api/announcements")
def create_ann(data: dict = Body(...), db: Session = Depends(get_db)):
    a = Announcement(id=str(uuid.uuid4()), text=data["text"], time=data["time"],
                     days=json.dumps(data.get("days",[])), active=data.get("active",True))
    db.add(a); db.commit(); return {"id":a.id,"ok":True}

@app.put("/api/announcements/{aid}")
def update_ann(aid: str, data: dict = Body(...), db: Session = Depends(get_db)):
    a = db.query(Announcement).get(aid)
    if not a: raise HTTPException(404)
    if "text"   in data: a.text   = data["text"]
    if "time"   in data: a.time   = data["time"]
    if "days"   in data: a.days   = json.dumps(data["days"])
    if "active" in data: a.active = data["active"]
    db.commit(); return {"ok":True}

@app.delete("/api/announcements/{aid}")
def delete_ann(aid: str, db: Session = Depends(get_db)):
    a = db.query(Announcement).get(aid)
    if a: db.delete(a); db.commit()
    return {"ok":True}

# ─── SETTINGS ─────────────────────────────────────────────────
@app.get("/api/settings")
def get_settings(db: Session = Depends(get_db)):
    return {s.key: s.value for s in db.query(Setting).all()}

@app.put("/api/settings")
def update_settings(data: dict = Body(...), db: Session = Depends(get_db)):
    for k, v in data.items():
        s = db.query(Setting).get(k)
        if s: s.value = str(v)
        else: db.add(Setting(key=k, value=str(v)))
    if "faceThreshold" in data:
        face_service.set_threshold(float(data["faceThreshold"]))
    db.commit(); return {"ok":True}

# ─── DASHBOARD ────────────────────────────────────────────────
@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db)):
    today = str(date.today())
    today_start = datetime.now().replace(hour=0,minute=0,second=0,microsecond=0)
    month_start = datetime.now().replace(day=1,hour=0,minute=0,second=0,microsecond=0)
    week_later  = str(date.today() + timedelta(days=7))
    return {
        "total_members":  db.query(Member).filter_by(active=True).count(),
        "today_checkins": db.query(Attendance).filter(Attendance.check_in >= today_start).count(),
        "active_ms":      db.query(Membership).filter(Membership.end_date >= today).count(),
        "month_revenue":  sum(p.amount for p in db.query(Payment).filter(Payment.created_at >= month_start).all()),
        "expiring_soon":  db.query(Membership).filter(Membership.end_date>=today,Membership.end_date<=week_later).count(),
        "face_registered":db.query(Member).filter_by(face_registered=True,active=True).count(),
    }


# ─── AUTH ─────────────────────────────────────────────────────
from fastapi import Header
from .auth import hash_password, verify_password, create_token, decode_token, role_has_permission
from .database import AdminUser, AudioAnnouncement
import shutil

AUDIO_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "audio")
os.makedirs(AUDIO_DIR, exist_ok=True)

def get_current_user(authorization: str = Header(None), db: Session = Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "No autenticado")
    token = authorization.split(" ", 1)[1]
    payload = decode_token(token)
    if not payload:
        raise HTTPException(401, "Token inválido o expirado")
    user = db.query(AdminUser).filter_by(username=payload.get("sub"), active=True).first()
    if not user:
        raise HTTPException(401, "Usuario no encontrado")
    return user

def require_role(min_role: str):
    from .auth import ROLE_LEVELS
    min_level = ROLE_LEVELS[min_role]
    def checker(current_user: AdminUser = Depends(get_current_user)):
        if not role_has_permission(current_user.role, min_level):
            raise HTTPException(403, f"Requiere rol: {min_role}")
        return current_user
    return checker

class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/api/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(AdminUser).filter_by(username=req.username, active=True).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(401, "Usuario o contraseña incorrectos")
    user.last_login = datetime.now()
    db.commit()
    token = create_token({"sub": user.username, "role": user.role, "id": user.id})
    return {
        "token": token,
        "user": _admin_user(user),
    }

@app.post("/api/auth/verify")
def verify_token(current_user: AdminUser = Depends(get_current_user)):
    return {"ok": True, "user": _admin_user(current_user)}

@app.post("/api/auth/change-password")
def change_password(data: dict = Body(...), current_user: AdminUser = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(data.get("current_password",""), current_user.password_hash):
        raise HTTPException(400, "Contraseña actual incorrecta")
    current_user.password_hash = hash_password(data["new_password"])
    db.commit()
    return {"ok": True}

# ─── ADMIN USERS ──────────────────────────────────────────────
@app.get("/api/admin-users")
def get_admin_users(db: Session = Depends(get_db), _: AdminUser = Depends(require_role("admin"))):
    return [_admin_user(u) for u in db.query(AdminUser).all()]

@app.post("/api/admin-users")
def create_admin_user(data: dict = Body(...), db: Session = Depends(get_db),
                      current_user: AdminUser = Depends(require_role("superadmin"))):
    if db.query(AdminUser).filter_by(username=data["username"]).first():
        raise HTTPException(400, "Nombre de usuario ya existe")
    u = AdminUser(
        id=str(uuid.uuid4()),
        username=data["username"],
        display_name=data.get("display_name", data["username"]),
        email=data.get("email",""),
        password_hash=hash_password(data["password"]),
        role=data.get("role","recepcion"),
        avatar=data.get("avatar",""),
        created_by=current_user.id,
    )
    db.add(u); db.commit(); db.refresh(u)
    return _admin_user(u)

@app.put("/api/admin-users/{uid}")
def update_admin_user(uid: str, data: dict = Body(...), db: Session = Depends(get_db),
                      current_user: AdminUser = Depends(require_role("admin"))):
    u = db.query(AdminUser).get(uid)
    if not u: raise HTTPException(404)
    # Solo superadmin puede cambiar roles
    if "role" in data and current_user.role != "superadmin":
        raise HTTPException(403, "Solo superadmin puede cambiar roles")
    # No se puede cambiar el propio rol ni desactivarse
    for k, v in data.items():
        if k == "password" and v:
            u.password_hash = hash_password(v)
        elif hasattr(u, k) and k not in ("id","password_hash","created_at"):
            setattr(u, k, v)
    db.commit(); return _admin_user(u)

@app.delete("/api/admin-users/{uid}")
def delete_admin_user(uid: str, db: Session = Depends(get_db),
                      current_user: AdminUser = Depends(require_role("superadmin"))):
    u = db.query(AdminUser).get(uid)
    if not u: raise HTTPException(404)
    if u.id == current_user.id: raise HTTPException(400, "No puedes eliminarte a ti mismo")
    u.active = False; db.commit()
    return {"ok": True}

def _admin_user(u):
    return {"id":u.id,"username":u.username,"display_name":u.display_name,
            "email":u.email,"role":u.role,"avatar":u.avatar,"active":u.active,
            "last_login":str(u.last_login) if u.last_login else None,
            "created_at":str(u.created_at)}

# ─── AUDIO ANNOUNCEMENTS ──────────────────────────────────────
from fastapi import UploadFile, File
from fastapi.responses import FileResponse as FR

@app.get("/api/audio-files")
def get_audio_files(db: Session = Depends(get_db)):
    files = db.query(AudioAnnouncement).order_by(AudioAnnouncement.created_at.desc()).all()
    return [{"id":f.id,"name":f.name,"filename":f.filename,"size_kb":f.size_kb,
             "created_at":str(f.created_at),"url":f"/api/audio-files/{f.id}/play"} for f in files]

@app.post("/api/audio-files/upload")
async def upload_audio(name: str = Form(...), file: UploadFile = File(...), db: Session = Depends(get_db)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".mp3", ".wav", ".ogg", ".m4a"):
        raise HTTPException(400, "Formato no soportado. Usa MP3, WAV, OGG o M4A.")
    fid      = str(uuid.uuid4())
    filename = fid + ext
    fpath    = os.path.join(AUDIO_DIR, filename)
    content  = await file.read()
    with open(fpath, "wb") as f:
        f.write(content)
    size_kb = len(content) // 1024
    af = AudioAnnouncement(id=fid, name=name, filename=filename, size_kb=size_kb)
    db.add(af); db.commit()
    return {"id":fid,"name":name,"filename":filename,"size_kb":size_kb,"url":f"/api/audio-files/{fid}/play"}

@app.get("/api/audio-files/{fid}/play")
def play_audio(fid: str, db: Session = Depends(get_db)):
    af = db.query(AudioAnnouncement).get(fid)
    if not af: raise HTTPException(404)
    fpath = os.path.join(AUDIO_DIR, af.filename)
    if not os.path.exists(fpath): raise HTTPException(404, "Archivo no encontrado")
    ext_map = {".mp3":"audio/mpeg",".wav":"audio/wav",".ogg":"audio/ogg",".m4a":"audio/mp4"}
    ext = os.path.splitext(af.filename)[1].lower()
    return FR(fpath, media_type=ext_map.get(ext,"audio/mpeg"))

@app.delete("/api/audio-files/{fid}")
def delete_audio(fid: str, db: Session = Depends(get_db)):
    af = db.query(AudioAnnouncement).get(fid)
    if af:
        fpath = os.path.join(AUDIO_DIR, af.filename)
        if os.path.exists(fpath): os.remove(fpath)
        db.delete(af); db.commit()
    return {"ok": True}