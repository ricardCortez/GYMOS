"""
GymOS - API Principal
Solo inicializa la app y registra los routers.
Toda la lógica de negocio vive en backend/routes/

Arrancar:
    python run.py
    uvicorn backend.main:app --host 0.0.0.0 --port 8000
"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .database import get_db, init_db, Member
from .face_service import face_service

<<<<<<< HEAD
from .routes.plans         import router as plans_router
from .routes.members       import router as members_router
from .routes.face          import router as face_router
from .routes.attendance    import router as attendance_router
from .routes.memberships   import router as memberships_router
from .routes.payments      import router as payments_router
from .routes.announcements import router as announcements_router
from .routes.settings      import router as settings_router
from .routes.dashboard     import router as dashboard_router
from .routes.admin_users   import router as admin_router
from .routes.audio         import router as audio_router
=======
from .routes.plans         import router as plans_router
from .routes.members       import router as members_router
from .routes.face          import router as face_router
from .routes.attendance    import router as attendance_router
from .routes.memberships   import router as memberships_router
from .routes.payments      import router as payments_router
from .routes.announcements import router as announcements_router
from .routes.settings      import router as settings_router
from .routes.dashboard     import router as dashboard_router
from .routes.admin_users   import router as admin_router
from .routes.tools         import router as tools_router
from .routes.audio         import router as audio_router
from .routes.promotions    import router as promotions_router
>>>>>>> 7694eb635fdf31c84e319458855d4c90ad7ea356

app = FastAPI(
    title="GymOS API",
    version="1.0.0",
    description="Sistema de gestión de gimnasio con reconocimiento facial",
)

<<<<<<< HEAD
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(plans_router)
app.include_router(members_router)
app.include_router(face_router)
app.include_router(attendance_router)
app.include_router(memberships_router)
app.include_router(payments_router)
app.include_router(announcements_router)
app.include_router(settings_router)
app.include_router(dashboard_router)
app.include_router(admin_router)
app.include_router(audio_router)

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
=======
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
>>>>>>> 7694eb635fdf31c84e319458855d4c90ad7ea356

<<<<<<< HEAD
@app.get("/")
def serve_index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

@app.get("/app.js")
def serve_appjs():
    return FileResponse(
        os.path.join(FRONTEND_DIR, "app.js"),
        media_type="application/javascript",
    )

app.mount("/assets", StaticFiles(directory=FRONTEND_DIR), name="static")

@app.on_event("startup")
async def startup():
    init_db()
    ok = face_service.initialize()
    if ok:
        db = next(get_db())
        members = db.query(Member).filter_by(face_registered=True, active=True).all()
        face_service.load_all([
            {"id": m.id, "face_embedding": m.face_embedding}
            for m in members
        ])
        db.close()
    status = "OK" if ok else "NO DISPONIBLE (instala insightface y onnxruntime)"
    print(f"GymOS API iniciada | Reconocimiento facial: {status}")
=======
app.include_router(plans_router)
app.include_router(members_router)
app.include_router(face_router)
app.include_router(attendance_router)
app.include_router(memberships_router)
app.include_router(payments_router)
app.include_router(announcements_router)
app.include_router(settings_router)
app.include_router(dashboard_router)
app.include_router(admin_router)
app.include_router(tools_router)
app.include_router(audio_router)
app.include_router(promotions_router)

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")

@app.get("/")
def serve_index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

@app.get("/app.js")
def serve_appjs():
    return FileResponse(
        os.path.join(FRONTEND_DIR, "app.js"),
        media_type="application/javascript",
    )

@app.get("/favicon.ico")
def serve_favicon():
    return FileResponse(
        os.path.join(FRONTEND_DIR, "favicon.ico"),
        media_type="image/x-icon",
    )

@app.get("/style.css")
def serve_css():
    return FileResponse(
        os.path.join(FRONTEND_DIR, "style.css"),
        media_type="text/css",
    )

@app.get("/themes.css")
def serve_themes_css():
    return FileResponse(
        os.path.join(FRONTEND_DIR, "themes.css"),
        media_type="text/css",
    )

# Serve all frontend static files
app.mount("/js",    StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")),    name="js")
app.mount("/views", StaticFiles(directory=os.path.join(FRONTEND_DIR, "views")), name="views")
app.mount("/assets", StaticFiles(directory=FRONTEND_DIR), name="static")

@app.on_event("startup")
async def startup():
    init_db()
    ok = face_service.initialize()
    if ok:
        db = next(get_db())
        members = db.query(Member).filter_by(face_registered=True, active=True).all()
        face_service.load_all([
            {"id": m.id, "face_embedding": m.face_embedding}
            for m in members
        ])
        db.close()
    status = "OK" if ok else "NO DISPONIBLE (instala insightface y onnxruntime)"
    print(f"GymOS API iniciada | Reconocimiento facial: {status}")
>>>>>>> 7694eb635fdf31c84e319458855d4c90ad7ea356