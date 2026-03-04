"""
GymOS - Rutas: Promociones por tiempo limitado

GET  /api/promotions              → listar todas
GET  /api/promotions/active       → solo las activas AHORA (para el wizard y contador)
POST /api/promotions              → crear
PUT  /api/promotions/{pid}        → editar
DELETE /api/promotions/{pid}      → eliminar
POST /api/promotions/apply        → aplicar promo a una membresía (registra uso)
POST /api/promotions/validate     → validar código de descuento antes de aplicar
"""
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
import json, uuid

from ..database import get_db, Promotion, Plan

router = APIRouter(prefix="/api/promotions", tags=["Promociones"])


# ── Helpers ───────────────────────────────────────────────────
def _is_active_now(p: Promotion) -> bool:
    """Verifica si la promo está vigente en este exacto momento."""
    if not p.active:
        return False
    now  = datetime.now()
    today = now.strftime("%Y-%m-%d")
    time  = now.strftime("%H:%M")

    if today < p.start_date or today > p.end_date:
        return False
    if today == p.start_date and time < p.start_time:
        return False
    if today == p.end_date and time > p.end_time:
        return False
    if p.uses_limit > 0 and p.uses_count >= p.uses_limit:
        return False
    return True


def _calc_discount(p: Promotion, original_price: float) -> float:
    """Calcula el precio final tras aplicar la promoción."""
    if p.discount_type == "percent":
        return round(original_price * (1 - p.discount_value / 100), 2)
    else:  # fixed
        return max(0.0, round(original_price - p.discount_value, 2))


def _serialize(p: Promotion, db: Session) -> dict:
    applies_to = json.loads(p.applies_to) if isinstance(p.applies_to, str) else (p.applies_to or [])
    now_active  = _is_active_now(p)

    # Segundos restantes hasta que venza (útil para el countdown)
    seconds_left = None
    if now_active:
        end_dt = datetime.strptime(f"{p.end_date} {p.end_time}", "%Y-%m-%d %H:%M")
        seconds_left = max(0, int((end_dt - datetime.now()).total_seconds()))

    # Nombre de los planes a los que aplica
    plan_names = []
    if applies_to:
        plans = db.query(Plan).filter(Plan.id.in_(applies_to)).all()
        plan_names = [pl.name for pl in plans]

    return {
        "id":             p.id,
        "name":           p.name,
        "description":    p.description,
        "code":           p.code,
        "discount_type":  p.discount_type,
        "discount_value": p.discount_value,
        "applies_to":     applies_to,
        "plan_names":     plan_names,
        "start_date":     p.start_date,
        "end_date":       p.end_date,
        "start_time":     p.start_time,
        "end_time":       p.end_time,
        "uses_limit":     p.uses_limit,
        "uses_count":     p.uses_count,
        "active":         p.active,
        "now_active":     now_active,
        "seconds_left":   seconds_left,
        "created_at":     str(p.created_at),
    }


# ── Schemas ───────────────────────────────────────────────────
class ApplyPromoReq(BaseModel):
    promotion_id: str
    plan_id:      str
    code:         Optional[str] = ""


class ValidateCodeReq(BaseModel):
    code:    str
    plan_id: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────
@router.get("")
def get_promotions(db: Session = Depends(get_db)):
    promos = db.query(Promotion).order_by(Promotion.created_at.desc()).all()
    return [_serialize(p, db) for p in promos]


@router.get("/active")
def get_active_promotions(plan_id: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Devuelve solo las promociones vigentes en este momento.
    Si se pasa plan_id, filtra las que aplican a ese plan.
    Usado por el wizard de membresía para mostrar descuentos disponibles.
    """
    promos  = db.query(Promotion).filter_by(active=True).all()
    active  = [p for p in promos if _is_active_now(p)]

    if plan_id:
        def applies(p):
            ids = json.loads(p.applies_to) if isinstance(p.applies_to, str) else (p.applies_to or [])
            return len(ids) == 0 or plan_id in ids   # vacío = todos los planes
        active = [p for p in active if applies(p)]

    # Ordenar: mayor descuento primero
    active.sort(key=lambda p: (
        p.discount_value if p.discount_type == "percent"
        else p.discount_value * 100   # rough equivalence
    ), reverse=True)

    return [_serialize(p, db) for p in active]


@router.post("")
def create_promotion(data: dict = Body(...), db: Session = Depends(get_db)):
    applies = data.get("applies_to", [])
    p = Promotion(
        id             = str(uuid.uuid4()),
        name           = data["name"],
        description    = data.get("description", ""),
        code           = data.get("code", "").upper().strip(),
        discount_type  = data.get("discount_type", "percent"),
        discount_value = float(data.get("discount_value", 0)),
        applies_to     = json.dumps(applies if isinstance(applies, list) else []),
        start_date     = data["start_date"],
        end_date       = data["end_date"],
        start_time     = data.get("start_time", "00:00"),
        end_time       = data.get("end_time", "23:59"),
        uses_limit     = int(data.get("uses_limit", 0)),
        active         = data.get("active", True),
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return _serialize(p, db)


@router.put("/{pid}")
def update_promotion(pid: str, data: dict = Body(...), db: Session = Depends(get_db)):
    p = db.query(Promotion).get(pid)
    if not p:
        raise HTTPException(404, "Promoción no encontrada")

    skip = {"id", "uses_count", "created_at"}
    for k, v in data.items():
        if k in skip:
            continue
        if k == "applies_to":
            v = json.dumps(v if isinstance(v, list) else [])
        if k == "code" and isinstance(v, str):
            v = v.upper().strip()
        if hasattr(p, k):
            setattr(p, k, v)

    db.commit()
    return _serialize(p, db)


@router.delete("/{pid}")
def delete_promotion(pid: str, db: Session = Depends(get_db)):
    p = db.query(Promotion).get(pid)
    if p:
        db.delete(p)
        db.commit()
    return {"ok": True}


@router.post("/validate")
def validate_code(req: ValidateCodeReq, db: Session = Depends(get_db)):
    """Valida un código de descuento antes de aplicarlo."""
    code = req.code.upper().strip()
    if not code:
        raise HTTPException(400, "Código vacío")

    promos = db.query(Promotion).filter_by(active=True).all()
    match  = next((p for p in promos if p.code == code), None)

    if not match:
        raise HTTPException(404, "Código no válido")
    if not _is_active_now(match):
        raise HTTPException(400, "Código expirado o fuera de vigencia")

    # Verificar que aplica al plan solicitado
    if req.plan_id:
        ids = json.loads(match.applies_to) if isinstance(match.applies_to, str) else (match.applies_to or [])
        if ids and req.plan_id not in ids:
            raise HTTPException(400, "Este código no aplica al plan seleccionado")

    return {
        "ok":       True,
        "promo":    _serialize(match, db),
        "message":  f"Código válido — {match.discount_value}{'%' if match.discount_type == 'percent' else ' ' + 'S/'} de descuento",
    }


@router.post("/apply")
def apply_promotion(req: ApplyPromoReq, db: Session = Depends(get_db)):
    """
    Registra el uso de una promoción y devuelve el precio final.
    Llamado desde el wizard al confirmar la membresía.
    """
    p = db.query(Promotion).get(req.promotion_id)
    if not p:
        raise HTTPException(404, "Promoción no encontrada")
    if not _is_active_now(p):
        raise HTTPException(400, "La promoción ya no está vigente")

    plan = db.query(Plan).get(req.plan_id)
    if not plan:
        raise HTTPException(404, "Plan no encontrado")

    # Código requerido si la promo lo tiene
    if p.code and req.code.upper().strip() != p.code:
        raise HTTPException(400, "Código de descuento incorrecto")

    final_price = _calc_discount(p, plan.price)
    discount    = round(plan.price - final_price, 2)

    # Incrementar contador de usos
    p.uses_count += 1
    db.commit()

    return {
        "ok":           True,
        "original":     plan.price,
        "discount":     discount,
        "final_price":  final_price,
        "promo_name":   p.name,
        "promo_id":     p.id,
    }