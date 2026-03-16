"""
GymOS - Autenticación con JWT + bcrypt directo (sin passlib)
"""
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone
from typing import Optional
import bcrypt, os

SECRET_KEY = os.getenv("GYMOS_SECRET", "gymos-secret-key-change-in-production-2024")
ALGORITHM  = "HS256"
TOKEN_EXPIRE_HOURS = 12

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def create_token(data: dict, expires_hours: int = TOKEN_EXPIRE_HOURS) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + timedelta(hours=expires_hours)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None

ROLE_LEVELS = {
    "superadmin":   100,
    "admin":         80,
    "recepcion":     40,
    "visualizador":  10,
}

def role_has_permission(role: str, required_level: int) -> bool:
    return ROLE_LEVELS.get(role, 0) >= required_level