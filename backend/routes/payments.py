"""
GymOS - Rutas: Pagos
GET  /api/payments  → historial completo
POST /api/payments  → registrar pago manual
"""
from fastapi import APIRouter, Depends, Body
from sqlalchemy.orm import Session
import uuid

from ..database import get_db, Payment, Member

router = APIRouter(prefix="/api/payments", tags=["Pagos"])


# ── Serializer ────────────────────────────────────────────────
def _pay(p: Payment, db: Session) -> dict:
    m = db.query(Member).get(p.member_id)
    return {
        "id":          p.id,
        "member_id":   p.member_id,
        "member_name": m.name if m else "?",
        "concept":     p.concept,
        "amount":      p.amount,
        "date":        p.date,
        "method":      p.method,
        "status":      p.status,
        "notes":       p.notes,
    }


# ── Endpoints ─────────────────────────────────────────────────
@router.get("")
def get_payments(db: Session = Depends(get_db)):
    return [
        _pay(p, db)
        for p in db.query(Payment).order_by(Payment.created_at.desc()).all()
    ]


@router.post("")
def create_payment(data: dict = Body(...), db: Session = Depends(get_db)):
    p = Payment(id=str(uuid.uuid4()))
    for k, v in data.items():
        if hasattr(p, k) and k != "id":
            setattr(p, k, v)
    db.add(p)
    db.commit()
    return _pay(p, db)