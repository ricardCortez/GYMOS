"""
GymOS - Rutas: Asistencia
POST /api/attendance/checkin  → registra entrada
GET  /api/attendance/today    → lista del día
GET  /api/attendance/stats    → agrupado por día (últimos N días)
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
import uuid

from ..database import get_db, Attendance, Member, Membership, Plan, Setting

router = APIRouter(prefix="/api/attendance", tags=["Asistencia"])


# ── Schema ────────────────────────────────────────────────────
class CheckinReq(BaseModel):
    member_id:  str
    method:     str            = "manual"   # facial | fingerprint | manual | qr
    confidence: Optional[float] = None
    notes:      str            = ""


# ── Endpoints ─────────────────────────────────────────────────
@router.post("/checkin")
def checkin(req: CheckinReq, db: Session = Depends(get_db)):
    # Respetar cooldown configurado
    s = db.query(Setting).get("checkinCooldown")
    cooldown = int(s.value) if s else 3600
    cutoff   = datetime.now() - timedelta(seconds=cooldown)

    recent = (
        db.query(Attendance)
        .filter_by(member_id=req.member_id)
        .filter(Attendance.check_in >= cutoff)
        .first()
    )
    if recent:
        return {"ok": False, "reason": "Cooldown activo"}

    a = Attendance(
        id=str(uuid.uuid4()),
        member_id=req.member_id,
        method=req.method,
        confidence=req.confidence,
        notes=req.notes,
    )
    db.add(a)
    db.commit()

    m = db.query(Member).get(req.member_id)
    return {"ok": True, "attendance_id": a.id, "member_name": m.name if m else ""}


@router.get("/today")
def today_attendance(db: Session = Depends(get_db)):
    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    records = (
        db.query(Attendance)
        .filter(Attendance.check_in >= today_start)
        .order_by(Attendance.check_in.desc())
        .all()
    )
    result = []
    for a in records:
        m  = db.query(Member).get(a.member_id)
        ms = (
            db.query(Membership)
            .filter_by(member_id=a.member_id)
            .order_by(Membership.end_date.desc())
            .first()
        )
        pl = db.query(Plan).get(ms.plan_id) if ms else None
        result.append({
            "id":            a.id,
            "member_id":     a.member_id,
            "member_name":   m.name   if m  else "?",
            "member_avatar": m.avatar if m  else "",
            "plan":          pl.name  if pl else "—",
            "check_in":      str(a.check_in),
            "method":        a.method,
            "confidence":    a.confidence,
        })
    return result


@router.get("/stats")
def attendance_stats(days: int = 30, db: Session = Depends(get_db)):
    cutoff  = datetime.now() - timedelta(days=days)
    records = db.query(Attendance).filter(Attendance.check_in >= cutoff).all()
    by_day  = {}
    for a in records:
        d = a.check_in.strftime("%Y-%m-%d")
        by_day[d] = by_day.get(d, 0) + 1
    return by_day