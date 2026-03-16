"""
GymOS - Rutas: Asistencia
POST /api/attendance/checkin     → registra entrada
GET  /api/attendance/today       → lista del día
GET  /api/attendance/history     → historial con filtros
GET  /api/attendance/stats       → agrupado por día
GET  /api/attendance/by-hour     → distribución por hora del día (para reportes)
GET  /api/attendance/top-members → miembros con más asistencias
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta, date
import uuid

from ..database import get_db, Attendance, Member, Membership, Plan, Setting

router = APIRouter(prefix="/api/attendance", tags=["Asistencia"])


# ── Schema ────────────────────────────────────────────────────
class CheckinReq(BaseModel):
    member_id:  str
    method:     str             = "manual"
    confidence: Optional[float] = None
    notes:      str             = ""


# ── Serializer (uso en history/top-members donde N+1 es aceptable) ────────────
def _att_row(a: Attendance, db: Session) -> dict:
    """
    Serializa un registro de asistencia.
    Si el miembro fue eliminado (active=False), lo marca como 'ex-miembro'
    pero conserva el registro histórico.
    """
    m  = db.query(Member).get(a.member_id)
    ms = (
        db.query(Membership)
        .filter_by(member_id=a.member_id)
        .order_by(Membership.end_date.desc())
        .first()
    )
    pl = db.query(Plan).get(ms.plan_id) if ms else None

    deleted = m is None or not m.active

    return {
        "id":            a.id,
        "member_id":     a.member_id,
        "member_name":   (m.name if m else "Miembro eliminado"),
        "member_avatar": (m.avatar if m and not deleted else ""),
        "plan":          pl.name if pl else "—",
        "check_in":      str(a.check_in),
        "method":        a.method,
        "confidence":    a.confidence,
        "deleted":       deleted,
    }


# ── Endpoints ─────────────────────────────────────────────────
@router.post("/checkin")
def checkin(req: CheckinReq, db: Session = Depends(get_db)):
    # Verificar que el miembro existe y está activo
    m = db.query(Member).get(req.member_id)
    if not m or not m.active:
        return {"ok": False, "reason": "Miembro no encontrado o eliminado"}

    # Respetar cooldown configurado
    s        = db.query(Setting).get("checkinCooldown")
    cooldown = int(s.value) if s else 3600
    cutoff   = datetime.now() - timedelta(seconds=cooldown)
    recent   = (
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
    return {"ok": True, "attendance_id": a.id, "member_name": m.name}


@router.get("/today")
def today_attendance(db: Session = Depends(get_db)):
    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    records = (
        db.query(Attendance)
        .filter(Attendance.check_in >= today_start)
        .order_by(Attendance.check_in.desc())
        .all()
    )
    if not records:
        return []

    # Bulk load: 1 query para todos los miembros, en vez de N queries
    member_ids = list({a.member_id for a in records})
    members_map = {
        m.id: m
        for m in db.query(Member).filter(Member.id.in_(member_ids)).all()
    }

    # Membresía vigente más reciente por miembro: 1 query total
    today_str = str(datetime.now().date())
    memberships_map: dict = {}
    for ms in (
        db.query(Membership)
        .filter(
            Membership.member_id.in_(member_ids),
            Membership.end_date >= today_str,
        )
        .order_by(Membership.end_date.desc())
        .all()
    ):
        memberships_map.setdefault(ms.member_id, ms)

    # Planes: 1 query total
    plan_ids = list({ms.plan_id for ms in memberships_map.values()})
    plans_map = {
        p.id: p
        for p in db.query(Plan).filter(Plan.id.in_(plan_ids)).all()
    } if plan_ids else {}

    result = []
    for a in records:
        m  = members_map.get(a.member_id)
        ms = memberships_map.get(a.member_id)
        pl = plans_map.get(ms.plan_id) if ms else None
        deleted = m is None or not m.active
        result.append({
            "id":            a.id,
            "member_id":     a.member_id,
            "member_name":   m.name   if m else "Miembro eliminado",
            "member_avatar": m.avatar if m and not deleted else "",
            "plan":          pl.name  if pl else "—",
            "check_in":      str(a.check_in),
            "method":        a.method,
            "confidence":    a.confidence,
            "deleted":       deleted,
        })
    return result


@router.get("/history")
def attendance_history(
    days:      int  = Query(30,  ge=1,  le=365),
    member_id: str  = Query(None),
    method:    str  = Query(None),
    db: Session = Depends(get_db),
):
    cutoff = datetime.now() - timedelta(days=days)
    q = db.query(Attendance).filter(Attendance.check_in >= cutoff)
    if member_id: q = q.filter_by(member_id=member_id)
    if method:    q = q.filter_by(method=method)
    records = q.order_by(Attendance.check_in.desc()).all()
    return [_att_row(a, db) for a in records]


@router.get("/stats")
def attendance_stats(days: int = 30, db: Session = Depends(get_db)):
    cutoff  = datetime.now() - timedelta(days=days)
    records = db.query(Attendance).filter(Attendance.check_in >= cutoff).all()
    by_day  = {}
    for a in records:
        d = a.check_in.strftime("%Y-%m-%d")
        by_day[d] = by_day.get(d, 0) + 1
    return by_day


@router.get("/by-hour")
def attendance_by_hour(days: int = 30, db: Session = Depends(get_db)):
    """Distribución de asistencias por hora del día (0-23). Útil para heatmap."""
    cutoff  = datetime.now() - timedelta(days=days)
    records = db.query(Attendance).filter(Attendance.check_in >= cutoff).all()
    by_hour = {str(h): 0 for h in range(24)}
    for a in records:
        h = str(a.check_in.hour)
        by_hour[h] = by_hour.get(h, 0) + 1
    return by_hour


@router.get("/top-members")
def top_members(days: int = 30, limit: int = 10, db: Session = Depends(get_db)):
    """Miembros con más asistencias en el período."""
    cutoff  = datetime.now() - timedelta(days=days)
    records = db.query(Attendance).filter(Attendance.check_in >= cutoff).all()
    counts  = {}
    for a in records:
        counts[a.member_id] = counts.get(a.member_id, 0) + 1
    top = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:limit]
    result = []
    for mid, cnt in top:
        m = db.query(Member).get(mid)
        if m:
            result.append({
                "member_id":   mid,
                "member_name": m.name,
                "avatar":      m.avatar,
                "count":       cnt,
                "active":      m.active,
            })
    return result
