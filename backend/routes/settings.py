"""
GymOS - Rutas: Configuración del gimnasio
GET /api/settings   → devuelve todos los pares clave-valor
PUT /api/settings   → actualiza uno o varios a la vez
"""
from fastapi import APIRouter, Depends, Body
from sqlalchemy.orm import Session

from ..database import get_db, Setting
from ..face_service import face_service

router = APIRouter(prefix="/api/settings", tags=["Configuración"])


@router.get("")
def get_settings(db: Session = Depends(get_db)):
    return {s.key: s.value for s in db.query(Setting).all()}


@router.put("")
def update_settings(data: dict = Body(...), db: Session = Depends(get_db)):
    for k, v in data.items():
        s = db.query(Setting).get(k)
        if s:
            s.value = str(v)
        else:
            db.add(Setting(key=k, value=str(v)))

    # Aplicar umbral en tiempo real al servicio facial
    if "faceThreshold" in data:
        face_service.set_threshold(float(data["faceThreshold"]))

    db.commit()
    return {"ok": True}