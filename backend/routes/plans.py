"""
GymOS - Rutas: Planes de membresía
GET    /api/plans
POST   /api/plans
PUT    /api/plans/{pid}
DELETE /api/plans/{pid}
"""
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
import json, uuid

from ..database import get_db, Plan

router = APIRouter(prefix="/api/plans", tags=["Planes"])


# ── Serializer ────────────────────────────────────────────────
def _plan(p: Plan) -> dict:
    return {
        "id":       p.id,
        "name":     p.name,
        "price":    p.price,
        "duration": p.duration,
        "icon":     p.icon,
        "color":    p.color,
        "featured": p.featured,
        "active":   p.active,
        "features": json.loads(p.features) if isinstance(p.features, str) else (p.features or []),
    }


# ── Endpoints ─────────────────────────────────────────────────
@router.get("")
def get_plans(db: Session = Depends(get_db)):
    return [_plan(p) for p in db.query(Plan).filter_by(active=True).all()]


@router.post("")
def create_plan(data: dict = Body(...), db: Session = Depends(get_db)):
    p = Plan(id=str(uuid.uuid4()))
    for k, v in data.items():
        if k == "features" and isinstance(v, list):
            v = json.dumps(v)
        if hasattr(p, k) and k != "id":
            setattr(p, k, v)
    db.add(p)
    db.commit()
    db.refresh(p)
    return _plan(p)


@router.put("/{pid}")
def update_plan(pid: str, data: dict = Body(...), db: Session = Depends(get_db)):
    p = db.query(Plan).get(pid)
    if not p:
        raise HTTPException(404, "Plan no encontrado")
    for k, v in data.items():
        if k == "features" and isinstance(v, list):
            v = json.dumps(v)
        if hasattr(p, k) and k != "id":
            setattr(p, k, v)
    db.commit()
    return _plan(p)


@router.delete("/{pid}")
def delete_plan(pid: str, db: Session = Depends(get_db)):
    p = db.query(Plan).get(pid)
    if p:
        p.active = False
        db.commit()
    return {"ok": True}