"""
GymOS - Rutas: Archivos de Audio para anuncios
GET    /api/audio-files
POST   /api/audio-files/upload
GET    /api/audio-files/{fid}/play
DELETE /api/audio-files/{fid}
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import os, uuid

from ..config import AUDIO_DIR
from ..database import get_db, AudioAnnouncement

router = APIRouter(prefix="/api/audio-files", tags=["Audio"])

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".ogg", ".m4a"}
MAX_UPLOAD_BYTES   = 50 * 1024 * 1024  # 50 MB
MIME_TYPES = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
}


# ── Endpoints ─────────────────────────────────────────────────
@router.get("")
def get_audio_files(db: Session = Depends(get_db)):
    files = db.query(AudioAnnouncement).order_by(AudioAnnouncement.created_at.desc()).all()
    return [
        {
            "id":         f.id,
            "name":       f.name,
            "filename":   f.filename,
            "size_kb":    f.size_kb,
            "created_at": str(f.created_at),
            "url":        f"/api/audio-files/{f.id}/play",
        }
        for f in files
    ]


@router.post("/upload")
async def upload_audio(
    name: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Formato no soportado. Usa: {', '.join(ALLOWED_EXTENSIONS)}")

    fid      = str(uuid.uuid4())
    filename = fid + ext
    fpath    = str(AUDIO_DIR / filename)

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Archivo demasiado grande. Máximo permitido: {MAX_UPLOAD_BYTES // (1024*1024)} MB")

    with open(fpath, "wb") as f:
        f.write(content)

    af = AudioAnnouncement(
        id=fid,
        name=name,
        filename=filename,
        size_kb=len(content) // 1024,
    )
    db.add(af)
    db.commit()

    return {
        "id":       fid,
        "name":     name,
        "filename": filename,
        "size_kb":  af.size_kb,
        "url":      f"/api/audio-files/{fid}/play",
    }


@router.get("/{fid}/play")
def play_audio(fid: str, db: Session = Depends(get_db)):
    af = db.query(AudioAnnouncement).get(fid)
    if not af:
        raise HTTPException(404, "Audio no encontrado")

    fpath = str(AUDIO_DIR / af.filename)
    if not os.path.exists(fpath):
        raise HTTPException(404, "Archivo físico no encontrado")

    ext = os.path.splitext(af.filename)[1].lower()
    return FileResponse(fpath, media_type=MIME_TYPES.get(ext, "audio/mpeg"))


@router.delete("/{fid}")
def delete_audio(fid: str, db: Session = Depends(get_db)):
    af = db.query(AudioAnnouncement).get(fid)
    if af:
        fpath = str(AUDIO_DIR / af.filename)
        if os.path.exists(fpath):
            os.remove(fpath)
        db.delete(af)
        db.commit()
    return {"ok": True}