"""
GymOS - Rutas: Autenticación y Usuarios Administradores
POST /api/auth/login
POST /api/auth/verify
POST /api/auth/change-password
GET  /api/admin-users
POST /api/admin-users
PUT  /api/admin-users/{uid}
DELETE /api/admin-users/{uid}
"""
from fastapi import APIRouter, Depends, HTTPException, Body, Header
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from datetime import datetime
import uuid

from ..database import get_db, AdminUser
from ..auth import (
    hash_password, verify_password,
    create_token, decode_token,
    role_has_permission, ROLE_LEVELS,
)

router = APIRouter(tags=["Auth & Usuarios"])


# ── Dependencias de seguridad ──────────────────────────────────
def get_current_user(
    authorization: str = Header(None),
    db: Session = Depends(get_db),
) -> AdminUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "No autenticado")
    token   = authorization.split(" ", 1)[1]
    payload = decode_token(token)
    if not payload:
        raise HTTPException(401, "Token inválido o expirado")
    user = db.query(AdminUser).filter_by(username=payload.get("sub"), active=True).first()
    if not user:
        raise HTTPException(401, "Usuario no encontrado")
    return user


def require_role(min_role: str):
    """Factoría de dependencia: exige un rol mínimo."""
    min_level = ROLE_LEVELS[min_role]

    def checker(current_user: AdminUser = Depends(get_current_user)) -> AdminUser:
        if not role_has_permission(current_user.role, min_level):
            raise HTTPException(403, f"Requiere rol: {min_role}")
        return current_user

    return checker


# ── Serializer ────────────────────────────────────────────────
def _user(u: AdminUser) -> dict:
    return {
        "id":           u.id,
        "username":     u.username,
        "display_name": u.display_name,
        "email":        u.email,
        "role":         u.role,
        "avatar":       u.avatar,
        "active":       u.active,
        "last_login":   str(u.last_login) if u.last_login else None,
        "created_at":   str(u.created_at),
    }


# ── Schemas ───────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str


# ── Auth endpoints ────────────────────────────────────────────
@router.post("/api/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(AdminUser).filter_by(username=req.username, active=True).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(401, "Usuario o contraseña incorrectos")
    user.last_login = datetime.now()
    db.commit()
    token = create_token({"sub": user.username, "role": user.role, "id": user.id})
    return {"token": token, "user": _user(user)}


@router.post("/api/auth/verify")
def verify_token(current_user: AdminUser = Depends(get_current_user)):
    return {"ok": True, "user": _user(current_user)}


@router.post("/api/auth/change-password")
def change_password(
    data: dict = Body(...),
    current_user: AdminUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(data.get("current_password", ""), current_user.password_hash):
        raise HTTPException(400, "Contraseña actual incorrecta")
    if len(data.get("new_password", "")) < 6:
        raise HTTPException(400, "La nueva contraseña debe tener mínimo 6 caracteres")
    current_user.password_hash = hash_password(data["new_password"])
    db.commit()
    return {"ok": True}


# ── Admin users endpoints ─────────────────────────────────────
@router.get("/api/admin-users")
def get_admin_users(
    db: Session = Depends(get_db),
    _: AdminUser = Depends(require_role("admin")),
):
    return [_user(u) for u in db.query(AdminUser).all()]


@router.post("/api/admin-users")
def create_admin_user(
    data: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: AdminUser = Depends(require_role("superadmin")),
):
    if db.query(AdminUser).filter_by(username=data["username"]).first():
        raise HTTPException(400, "Nombre de usuario ya existe")
    u = AdminUser(
        id=str(uuid.uuid4()),
        username=data["username"],
        display_name=data.get("display_name", data["username"]),
        email=data.get("email", ""),
        password_hash=hash_password(data["password"]),
        role=data.get("role", "recepcion"),
        avatar=data.get("avatar", ""),
        created_by=current_user.id,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return _user(u)


@router.put("/api/admin-users/{uid}")
def update_admin_user(
    uid: str,
    data: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: AdminUser = Depends(require_role("admin")),
):
    u = db.query(AdminUser).get(uid)
    if not u:
        raise HTTPException(404, "Usuario no encontrado")
    if "role" in data and current_user.role != "superadmin":
        raise HTTPException(403, "Solo superadmin puede cambiar roles")
    for k, v in data.items():
        if k == "password" and v:
            u.password_hash = hash_password(v)
        elif hasattr(u, k) and k not in ("id", "password_hash", "created_at"):
            setattr(u, k, v)
    db.commit()
    return _user(u)


@router.patch("/api/admin-users/{uid}/toggle")
def toggle_admin_user(
    uid: str,
    db: Session = Depends(get_db),
    current_user: AdminUser = Depends(require_role("superadmin")),
):
    """Activar o desactivar un usuario sin eliminarlo."""
    u = db.query(AdminUser).get(uid)
    if not u:
        raise HTTPException(404, "Usuario no encontrado")
    if u.id == current_user.id:
        raise HTTPException(400, "No puedes desactivarte a ti mismo")
    u.active = not u.active
    db.commit()
    return _user(u)


@router.delete("/api/admin-users/{uid}")
def delete_admin_user(
    uid: str,
    db: Session = Depends(get_db),
    current_user: AdminUser = Depends(require_role("superadmin")),
):
    """Eliminar permanentemente un usuario del sistema (SQL directo)."""
    if uid == current_user.id:
        raise HTTPException(400, "No puedes eliminarte a ti mismo")
    # Raw SQL to guarantee physical deletion regardless of ORM cache
    result = db.execute(
        text("DELETE FROM admin_users WHERE id = :uid"),
        {"uid": uid}
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(404, "Usuario no encontrado")
    return {"ok": True, "deleted": uid}
