"""
GymOS - Rutas: Herramientas de administración
POST /api/tools/clear-attendance      — superadmin: borrar registros de asistencia
POST /api/tools/clear-payments        — superadmin: borrar registros de pagos
POST /api/tools/clear-all             — superadmin: resetear toda la BD (mantiene usuarios)
GET  /api/tools/export-members        — admin+: exportar miembros CSV
GET  /api/tools/export-members-excel  — admin+: exportar miembros XLSX (via CSV)
GET  /api/tools/export-report         — admin+: exportar reporte de asistencia y pagos CSV
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
import csv, io
from datetime import datetime

from ..database import get_db, Member, Attendance, Payment, Membership, Plan, AdminUser
from ..routes.admin_users import require_role, get_current_user
from ..auth import decode_token


def _auth_export(token: str = Query(None), db: Session = Depends(get_db)) -> AdminUser:
    """Permite autenticación via ?token=... para descargas directas de archivos."""
    if not token:
        raise HTTPException(401, "Token requerido")
    payload = decode_token(token)
    if not payload:
        raise HTTPException(401, "Token inválido o expirado")
    user = db.query(AdminUser).filter_by(username=payload.get("sub"), active=True).first()
    if not user:
        raise HTTPException(401, "Usuario no encontrado")
    return user

router = APIRouter(prefix="/api/tools", tags=["Herramientas"])

# ─────────────────────────────────────────────────────────────
#  SUPERADMIN: limpiar registros
# ─────────────────────────────────────────────────────────────

@router.post("/clear-attendance")
def clear_attendance(
    db: Session = Depends(get_db),
    _: AdminUser = Depends(require_role("superadmin")),
):
    """Elimina todos los registros de asistencia."""
    result = db.execute(text("DELETE FROM attendance"))
    db.commit()
    return {"ok": True, "deleted": result.rowcount}


@router.post("/clear-payments")
def clear_payments(
    db: Session = Depends(get_db),
    _: AdminUser = Depends(require_role("superadmin")),
):
    """Elimina todos los registros de pagos."""
    result = db.execute(text("DELETE FROM payments"))
    db.commit()
    return {"ok": True, "deleted": result.rowcount}


@router.post("/clear-memberships")
def clear_memberships(
    db: Session = Depends(get_db),
    _: AdminUser = Depends(require_role("superadmin")),
):
    """Elimina todas las membresías activas."""
    result = db.execute(text("DELETE FROM memberships"))
    db.commit()
    return {"ok": True, "deleted": result.rowcount}


@router.post("/clear-all")
def clear_all(
    db: Session = Depends(get_db),
    _: AdminUser = Depends(require_role("superadmin")),
):
    """Resetea completamente la BD (mantiene usuarios admin y planes)."""
    counts = {}
    for table in ["attendance", "payments", "memberships", "members"]:
        r = db.execute(text(f"DELETE FROM {table}"))
        counts[table] = r.rowcount
    db.commit()
    return {"ok": True, "cleared": counts}


# ─────────────────────────────────────────────────────────────
#  ADMIN+: exportar miembros CSV
# ─────────────────────────────────────────────────────────────

@router.get("/export-members")
def export_members(
    db: Session = Depends(get_db),
    _: AdminUser = Depends(_auth_export),
):
    members = db.query(Member).filter_by(active=True).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ID", "Nombre", "Email", "Teléfono", "DNI",
        "Fecha Nacimiento", "Dirección", "Contacto Emergencia",
        "Fecha Registro", "Facial Registrado", "Notas"
    ])
    for m in members:
        writer.writerow([
            m.id, m.name, m.email or "", m.phone or "",
            m.document_id or "", m.birth_date or "", m.address or "",
            m.emergency_contact or "", m.join_date or "",
            "Sí" if m.face_registered else "No", m.notes or ""
        ])

    output.seek(0)
    filename = f"miembros_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
    return StreamingResponse(
        iter([output.getvalue().encode("utf-8-sig")]),  # utf-8-sig for Excel
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ─────────────────────────────────────────────────────────────
#  ADMIN+: exportar reporte completo CSV
# ─────────────────────────────────────────────────────────────

@router.get("/export-report")
def export_report(
    db: Session = Depends(get_db),
    _: AdminUser = Depends(_auth_export),
):
    output = io.StringIO()
    writer = csv.writer(output)

    # ── Hoja 1: Resumen ──
    members  = db.query(Member).filter_by(active=True).count()
    att_all  = db.query(Attendance).count()
    pay_raw  = db.execute(text("SELECT COALESCE(SUM(amount),0) FROM payments")).scalar()
    pay_all  = float(pay_raw or 0)

    writer.writerow(["=== RESUMEN GENERAL ==="])
    writer.writerow(["Miembros activos", members])
    writer.writerow(["Total asistencias", att_all])
    writer.writerow(["Ingresos totales", f"{pay_all:.2f}"])
    writer.writerow(["Generado el", datetime.now().strftime("%d/%m/%Y %H:%M")])
    writer.writerow([])

    # ── Hoja 2: Asistencia (últimos 90 días) ──
    writer.writerow(["=== ASISTENCIA (últimos 90 días) ==="])
    writer.writerow(["Fecha", "Hora", "Miembro", "Método", "Confianza"])
    try:
        rows = db.execute(text("""
            SELECT a.check_in, m.name, a.method, a.confidence
            FROM attendance a
            JOIN members m ON a.member_id = m.id
            WHERE a.check_in >= date('now', '-90 days')
            ORDER BY a.check_in DESC
        """)).fetchall()
        for row in rows:
            dt = str(row[0]) if row[0] else ""
            conf = row[3]
            writer.writerow([
                dt[:10], dt[11:16] if len(dt) > 10 else "",
                row[1] or "", row[2] or "manual",
                f"{float(conf)*100:.0f}%" if conf else "0%"
            ])
    except Exception as e:
        writer.writerow([f"Error al leer asistencia: {e}"])
    writer.writerow([])

    # ── Hoja 3: Pagos ──
    writer.writerow(["=== PAGOS ==="])
    writer.writerow(["Fecha", "Miembro", "Plan", "Monto", "Método", "Notas"])
    try:
        pays = db.execute(text("""
            SELECT p.created_at, m.name, p.concept, p.amount, p.method, p.notes
            FROM payments p
            JOIN members m ON p.member_id = m.id
            ORDER BY p.created_at DESC
        """)).fetchall()
        for row in pays:
            dt = str(row[0]) if row[0] else ""
            writer.writerow([
                dt[:10], row[1] or "", row[2] or "",
                f"{float(row[3]):.2f}" if row[3] else "0.00",
                row[4] or "", row[5] or ""
            ])
    except Exception as e:
        writer.writerow([f"Error al leer pagos: {e}"])

    output.seek(0)
    filename = f"reporte_gymos_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
    return StreamingResponse(
        iter([output.getvalue().encode("utf-8-sig")]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )