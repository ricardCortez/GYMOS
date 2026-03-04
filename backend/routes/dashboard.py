"""
GymOS - Rutas: Dashboard
GET /api/dashboard → KPIs generales del sistema
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import date, datetime, timedelta

from ..database import get_db, Member, Membership, Attendance, Payment

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("")
def get_dashboard(db: Session = Depends(get_db)):
    today       = str(date.today())
    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    week_later  = str(date.today() + timedelta(days=7))

    month_revenue = sum(
        p.amount
        for p in db.query(Payment).filter(Payment.created_at >= month_start).all()
    )

    return {
        "total_members":   db.query(Member).filter_by(active=True).count(),
        "today_checkins":  db.query(Attendance).filter(Attendance.check_in >= today_start).count(),
        "active_ms":       db.query(Membership).filter(Membership.end_date >= today).count(),
        "month_revenue":   month_revenue,
        "expiring_soon":   db.query(Membership).filter(
                               Membership.end_date >= today,
                               Membership.end_date <= week_later
                           ).count(),
        "face_registered": db.query(Member).filter_by(face_registered=True, active=True).count(),
    }