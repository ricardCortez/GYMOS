"""
GymOS - Rutas: Membresías
GET  /api/memberships                → listar (active_only=true/false)
POST /api/memberships                → crear + generar pago automático
PUT  /api/memberships/{msid}/renew   → renovar + nuevo pago
"""
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from datetime import date, datetime, timedelta
import uuid

from ..database import get_db, Membership, Plan, Member, Payment

router = APIRouter(prefix="/api/memberships", tags=["Membresías"])


# ── Serializer ────────────────────────────────────────────────
def _ms(ms: Membership, db: Session) -> dict:
    m    = db.query(Member).get(ms.member_id)
    plan = db.query(Plan).get(ms.plan_id)
    today = date.today()
    end   = datetime.strptime(ms.end_date, "%Y-%m-%d").date()
    return {
        "id":          ms.id,
        "member_id":   ms.member_id,
        "member_name": m.name    if m    else "?",
        "plan_id":     ms.plan_id,
        "plan_name":   plan.name if plan else "?",
        "start_date":  ms.start_date,
        "end_date":    ms.end_date,
        "days_left":   (end - today).days,
        "active":      end >= today,
        "amount":      ms.amount,
        "notes":       ms.notes,
    }


# ── Endpoints ─────────────────────────────────────────────────
@router.get("")
def get_memberships(active_only: bool = False, db: Session = Depends(get_db)):
    q = db.query(Membership)
    if active_only:
        q = q.filter(Membership.end_date >= str(date.today()))
    return [_ms(ms, db) for ms in q.order_by(Membership.end_date.desc()).all()]


@router.post("")
def create_membership(data: dict = Body(...), db: Session = Depends(get_db)):
    plan = db.query(Plan).get(data["plan_id"])
    if not plan:
        raise HTTPException(404, "Plan no encontrado")

    start  = data.get("start_date", str(date.today()))
    end_dt = datetime.strptime(start, "%Y-%m-%d") + timedelta(days=plan.duration)

    ms = Membership(
        id=str(uuid.uuid4()),
        member_id=data["member_id"],
        plan_id=plan.id,
        start_date=start,
        end_date=end_dt.strftime("%Y-%m-%d"),
        amount=data.get("amount", plan.price),
        notes=data.get("notes", ""),
    )
    # Pago automático al crear membresía
    pay = Payment(
        id=str(uuid.uuid4()),
        member_id=data["member_id"],
        concept=f"Membresía {plan.name}",
        amount=ms.amount,
        date=start,
        method=data.get("payment_method", "Efectivo"),
        status="pagado",
    )
    db.add(ms)
    db.add(pay)
    db.commit()
    return _ms(ms, db)


@router.put("/{msid}/renew")
def renew_membership(msid: str, data: dict = Body(...), db: Session = Depends(get_db)):
    ms = db.query(Membership).get(msid)
    if not ms:
        raise HTTPException(404, "Membresía no encontrada")

    plan   = db.query(Plan).get(data.get("plan_id", ms.plan_id))
    start  = data.get("start_date", str(date.today()))
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
    db.add(pay)
    db.commit()
    return _ms(ms, db)