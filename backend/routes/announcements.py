"""
GymOS - Rutas: Anuncios de voz programados
GET    /api/announcements
POST   /api/announcements
PUT    /api/announcements/{aid}
DELETE /api/announcements/{aid}
"""
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
import json, uuid

from ..database import get_db, Announcement

router = APIRouter(prefix="/api/announcements", tags=["Anuncios"])


# ── Endpoints ─────────────────────────────────────────────────
@router.get("")
def get_announcements(db: Session = Depends(get_db)):
    return [
        {
            "id":     a.id,
            "text":   a.text,
            "time":   a.time,
            "days":   json.loads(a.days) if isinstance(a.days, str) else (a.days or []),
            "active": a.active,
        }
        for a in db.query(Announcement).all()
    ]


@router.post("")
def create_announcement(data: dict = Body(...), db: Session = Depends(get_db)):
    a = Announcement(
        id=str(uuid.uuid4()),
        text=data["text"],
        time=data["time"],
        days=json.dumps(data.get("days", [])),
        active=data.get("active", True),
    )
    db.add(a)
    db.commit()
    return {"id": a.id, "ok": True}


@router.put("/{aid}")
def update_announcement(aid: str, data: dict = Body(...), db: Session = Depends(get_db)):
    a = db.query(Announcement).get(aid)
    if not a:
        raise HTTPException(404, "Anuncio no encontrado")
    if "text"   in data: a.text   = data["text"]
    if "time"   in data: a.time   = data["time"]
    if "days"   in data: a.days   = json.dumps(data["days"])
    if "active" in data: a.active = data["active"]
    db.commit()
    return {"ok": True}


@router.delete("/{aid}")
def delete_announcement(aid: str, db: Session = Depends(get_db)):
    a = db.query(Announcement).get(aid)
    if a:
        db.delete(a)
        db.commit()
    return {"ok": True}