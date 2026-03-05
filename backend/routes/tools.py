"""
GymOS - Rutas: Herramientas de administración
POST /api/tools/clear-attendance      — superadmin: borrar registros de asistencia
POST /api/tools/clear-payments        — superadmin: borrar registros de pagos
POST /api/tools/clear-all             — superadmin: resetear toda la BD (mantiene usuarios)
GET  /api/tools/export-members        — admin+: exportar miembros CSV
GET  /api/tools/export-members-excel  — admin+: exportar miembros XLSX (via CSV)
GET  /api/tools/export-report         — admin+: exportar reporte de asistencia y pagos CSV
"""
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
import csv, io, json
from datetime import datetime

from ..database import get_db, Member, Attendance, Payment, Membership, Plan, AdminUser
from ..routes.admin_users import require_role, get_current_user

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
    _: AdminUser = Depends(require_role("admin")),
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
    _: AdminUser = Depends(require_role("admin")),
):
    output = io.StringIO()
    writer = csv.writer(output)

    # ── Hoja 1: Resumen ──
    members  = db.query(Member).filter_by(active=True).count()
    att_all  = db.query(Attendance).count()
    pay_all  = db.execute(text("SELECT COALESCE(SUM(amount),0) FROM payments")).scalar()

    writer.writerow(["=== RESUMEN GENERAL ==="])
    writer.writerow(["Miembros activos", members])
    writer.writerow(["Total asistencias", att_all])
    writer.writerow(["Ingresos totales", f"{pay_all:.2f}"])
    writer.writerow(["Generado el", datetime.now().strftime("%d/%m/%Y %H:%M")])
    writer.writerow([])

    # ── Hoja 2: Asistencia (últimos 90 días) ──
    writer.writerow(["=== ASISTENCIA (últimos 90 días) ==="])
    writer.writerow(["Fecha", "Hora", "Miembro", "Método", "Confianza"])
    rows = db.execute(text("""
        SELECT a.check_in, m.name, a.method, a.confidence
        FROM attendance a
        JOIN members m ON a.member_id = m.id
        WHERE a.check_in >= date('now', '-90 days')
        ORDER BY a.check_in DESC
    """)).fetchall()
    for row in rows:
        dt = str(row[0])
        writer.writerow([dt[:10], dt[11:16], row[1], row[2] or "manual", f"{(row[3] or 0)*100:.0f}%"])
    writer.writerow([])

    # ── Hoja 3: Pagos ──
    writer.writerow(["=== PAGOS ==="])
    writer.writerow(["Fecha", "Miembro", "Plan", "Monto", "Método", "Notas"])
    pays = db.execute(text("""
        SELECT p.created_at, m.name, pl.name, p.amount, p.method, p.notes
        FROM payments p
        JOIN members m ON p.member_id = m.id
        LEFT JOIN plans pl ON p.plan_id = pl.id
        ORDER BY p.created_at DESC
    """)).fetchall()
    for row in pays:
        dt = str(row[0])
        writer.writerow([dt[:10], row[1], row[2] or "", f"{row[3]:.2f}", row[4] or "", row[5] or ""])

    output.seek(0)
    filename = f"reporte_gymos_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
    return StreamingResponse(
        iter([output.getvalue().encode("utf-8-sig")]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )