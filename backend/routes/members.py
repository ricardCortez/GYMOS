"""
GymOS - Rutas: Miembros
GET    /api/members
GET    /api/members/{mid}
POST   /api/members
PUT    /api/members/{mid}
DELETE /api/members/{mid}
"""
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from datetime import date
import uuid

from ..database import get_db, Member
from ..face_service import face_service

router = APIRouter(prefix="/api/members", tags=["Miembros"])


# ── Serializer ────────────────────────────────────────────────
def _member(m: Member) -> dict:
    return {
        "id":                m.id,
        "name":              m.name,
        "email":             m.email,
        "phone":             m.phone,
        "document_id":       m.document_id,
        "birth_date":        m.birth_date,
        "address":           m.address,
        "emergency_contact": m.emergency_contact,
        "notes":             m.notes,
        "avatar":            m.avatar,
        "join_date":         m.join_date,
        "active":            m.active,
        "face_registered":   m.face_registered,
        "face_samples":      m.face_samples,
        "has_fingerprint":   bool(m.credential_id),
        "credential_id":     m.credential_id,
        "created_at":        str(m.created_at),
    }


# ── Endpoints ─────────────────────────────────────────────────
@router.get("")
def get_members(db: Session = Depends(get_db)):
    return [_member(m) for m in db.query(Member).filter_by(active=True).all()]


@router.get("/{mid}")
def get_member(mid: str, db: Session = Depends(get_db)):
    m = db.query(Member).get(mid)
    if not m:
        raise HTTPException(404, "Miembro no encontrado")
    return _member(m)


@router.post("")
def create_member(data: dict = Body(...), db: Session = Depends(get_db)):
    skip = {"id", "face_embedding", "face_registered", "face_samples", "credential_id"}
    m = Member(id=str(uuid.uuid4()), join_date=str(date.today()))
    for k, v in data.items():
        if k not in skip and hasattr(m, k):
            setattr(m, k, v)
    db.add(m)
    db.commit()
    db.refresh(m)
    return _member(m)


@router.put("/{mid}")
def update_member(mid: str, data: dict = Body(...), db: Session = Depends(get_db)):
    m = db.query(Member).get(mid)
    if not m:
        raise HTTPException(404, "Miembro no encontrado")
    skip = {"id", "face_embedding", "face_registered", "face_samples", "created_at"}
    for k, v in data.items():
        if k not in skip and hasattr(m, k):
            setattr(m, k, v)
    db.commit()
    return _member(m)


@router.delete("/{mid}")
def delete_member(mid: str, db: Session = Depends(get_db)):
    m = db.query(Member).get(mid)
    if m:
        m.active = False
        face_service.remove(mid)
        db.commit()
    return {"ok": True}