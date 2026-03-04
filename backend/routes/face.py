"""
GymOS - Rutas: Reconocimiento Facial
POST /api/face/register  → registra embeddings de un miembro
POST /api/face/identify  → identifica un rostro en un frame
POST /api/face/status    → estado del modelo y caché
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
from datetime import date, datetime

from ..database import get_db, Member, Membership, Plan
from ..face_service import face_service

router = APIRouter(prefix="/api/face", tags=["Reconocimiento Facial"])


# ── Schemas ───────────────────────────────────────────────────
class RegisterFaceReq(BaseModel):
    member_id: str
    images: List[str]          # lista de base64 JPEG


class IdentifyReq(BaseModel):
    image: str                 # base64 JPEG de un frame


# ── Endpoints ─────────────────────────────────────────────────
@router.post("/register")
def register_face(req: RegisterFaceReq, db: Session = Depends(get_db)):
    if not face_service.ready:
        raise HTTPException(503, "Servicio facial no disponible. Instala insightface y onnxruntime.")

    m = db.query(Member).get(req.member_id)
    if not m:
        raise HTTPException(404, "Miembro no encontrado")

    emb_bytes, n, msg = face_service.register(
        req.member_id, req.images, m.face_embedding
    )
    if emb_bytes is None:
        raise HTTPException(400, msg)

    m.face_embedding  = emb_bytes
    m.face_registered = True
    m.face_samples    = (m.face_samples or 0) + n
    db.commit()

    return {
        "ok":        True,
        "member_id": req.member_id,
        "samples":   m.face_samples,
        "message":   msg,
    }


@router.post("/identify")
def identify_face(req: IdentifyReq, db: Session = Depends(get_db)):
    if not face_service.ready:
        return {"identified": False, "reason": "Modelo no disponible"}

    result = face_service.identify(req.image)
    if result is None:
        return {"identified": False, "reason": "No reconocido"}

    member_id, confidence = result
    m = db.query(Member).get(member_id)
    if not m:
        return {"identified": False, "reason": "Miembro no en DB"}

    today = str(date.today())
    ms = (
        db.query(Membership)
        .filter_by(member_id=member_id)
        .filter(Membership.end_date >= today)
        .order_by(Membership.end_date.desc())
        .first()
    )
    plan = db.query(Plan).get(ms.plan_id) if ms else None
    days_left = (
        (datetime.strptime(ms.end_date, "%Y-%m-%d").date() - date.today()).days
        if ms else 0
    )

    return {
        "identified": True,
        "member_id":  member_id,
        "confidence": confidence,
        "member": {
            "id":                m.id,
            "name":              m.name,
            "avatar":            m.avatar,
            "plan":              plan.name if plan else "Sin plan",
            "membership_active": bool(ms),
            "days_left":         days_left,
        },
    }


@router.post("/status")
def face_status():
    return {
        "available":        face_service.ready,
        "registered_count": len(face_service._cache),
        "threshold":        face_service.threshold,
    }