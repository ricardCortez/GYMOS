// ══════════════════════════════════════════════════════════════
//  REPORTS
// ══════════════════════════════════════════════════════════════
let charts = {};
async function renderReports() {
  try {
    const days = parseInt(document.getElementById('rep-days')?.value || '30');

    const [stats, attStats, byHour, topMembers, ms, pays] = await Promise.all([
      GET('/dashboard'),
      GET('/attendance/stats?days=' + days),
      GET('/attendance/by-hour?days=' + days),
      GET('/attendance/top-members?days=' + days + '&limit=8'),
      GET('/memberships'),
      GET('/payments'),
    ]);

    // ── KPIs ──────────────────────────────────────────────────
    const avgPerDay = days > 0
      ? (Object.values(attStats).reduce((s,v)=>s+v,0) / days).toFixed(1)
      : 0;
    const expiringSoon = ms.filter(m => m.active && m.days_left <= 7).length;

    document.getElementById('rep-kpis').innerHTML = `
      <div class="kpi" style="--kpi-c:var(--cyan)">
        <div class="kpi-val">${stats.total_members}</div>
        <div class="kpi-lbl">Total Miembros</div>
      </div>
      <div class="kpi" style="--kpi-c:var(--green)">
        <div class="kpi-val">${stats.active_ms}</div>
        <div class="kpi-lbl">Membresías Activas</div>
      </div>
      <div class="kpi" style="--kpi-c:var(--orange)">
        <div class="kpi-val">${CFG.currency}${(stats.month_revenue||0).toLocaleString()}</div>
        <div class="kpi-lbl">Ingresos del Mes</div>
      </div>
      <div class="kpi" style="--kpi-c:var(--purple)">
        <div class="kpi-val">${avgPerDay}</div>
        <div class="kpi-lbl">Asistencia Promedio/Día</div>
      </div>
      <div class="kpi" style="--kpi-c:var(--yellow)">
        <div class="kpi-val">${expiringSoon}</div>
        <div class="kpi-lbl">Membresías por Vencer (7d)</div>
      </div>
      <div class="kpi" style="--kpi-c:var(--cyan)">
        <div class="kpi-val">${stats.face_registered}</div>
        <div class="kpi-lbl">Con Reconocimiento Facial</div>
      </div>
    `;

    // ── Gráfico 1: Asistencia diaria (línea) ──────────────────
    const attLabels = [], attData = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d  = new Date(now); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const label = days <= 14
        ? d.getDate() + '/' + (d.getMonth() + 1)
        : (i % Math.ceil(days / 10) === 0 ? d.getDate() + '/' + (d.getMonth() + 1) : '');
      attLabels.push(label);
      attData.push(attStats[ds] || 0);
    }
    const attCtx = document.getElementById('att-chart');
    if (charts.att) charts.att.destroy();
    charts.att = new Chart(attCtx, {
      type: 'line',
      data: {
        labels: attLabels,
        datasets: [{
          label: 'Asistencias',
          data: attData,
          borderColor: 'rgba(0,212,255,1)',
          backgroundColor: 'rgba(0,212,255,.08)',
          fill: true, tension: 0.4, pointRadius: 2, pointHoverRadius: 5,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: {
          title: (items) => 'Fecha: ' + (attLabels[items[0].dataIndex] || ''),
          label: (item) => 'Asistencias: ' + item.raw,
        }}},
        scales: {
          x: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#8890c0', maxRotation: 0 }},
          y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#8890c0', stepSize: 1 }, beginAtZero: true },
        },
      }
    });

    // ── Gráfico 2: Ingresos mensuales (barras) ────────────────
    const revLabels = [], revData = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now); d.setMonth(d.getMonth() - i); d.setDate(1);
      revLabels.push(MONTHS[d.getMonth()] + ' ' + d.getFullYear().toString().slice(2));
      const rev = pays
        .filter(p => { const pd = new Date(p.date); return pd.getFullYear()===d.getFullYear() && pd.getMonth()===d.getMonth(); })
        .reduce((s, p) => s + p.amount, 0);
      revData.push(rev);
    }
    const revCtx = document.getElementById('rev-chart');
    if (charts.rev) charts.rev.destroy();
    charts.rev = new Chart(revCtx, {
      type: 'bar',
      data: {
        labels: revLabels,
        datasets: [{
          label: 'Ingresos',
          data: revData,
          backgroundColor: revData.map((_, i) => i === revData.length - 1 ? 'rgba(255,107,0,.9)' : 'rgba(255,107,0,.45)'),
          borderColor: 'rgba(255,107,0,1)',
          borderWidth: 2, borderRadius: 6,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: {
          label: (item) => CFG.currency + item.raw.toLocaleString(),
        }}},
        scales: {
          x: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#8890c0' }},
          y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#8890c0', callback: v => CFG.currency + v.toLocaleString() }, beginAtZero: true },
        },
      }
    });

    // ── Gráfico 3: Distribución por plan (dona) ───────────────
    const planCounts = {};
    PLANS.forEach(p => { planCounts[p.id] = 0; });
    ms.filter(m => m.active).forEach(m => { if (planCounts[m.plan_id] !== undefined) planCounts[m.plan_id]++; });
    const planCtx = document.getElementById('plan-chart');
    if (charts.plan) charts.plan.destroy();
    charts.plan = new Chart(planCtx, {
      type: 'doughnut',
      data: {
        labels: PLANS.map(p => p.name),
        datasets: [{
          data: PLANS.map(p => planCounts[p.id] || 0),
          backgroundColor: ['rgba(255,107,0,.85)','rgba(0,212,255,.85)','rgba(0,229,160,.85)','rgba(170,85,255,.85)','rgba(255,209,102,.85)'],
          borderColor: 'var(--s1)', borderWidth: 3,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: '#8890c0', padding: 14, boxWidth: 14 }},
          tooltip: { callbacks: { label: (item) => ` ${item.label}: ${item.raw} miembro${item.raw !== 1 ? 's' : ''}` }}
        },
      }
    });

    // ── Gráfico 4: Horas pico (barras horizontales) ───────────
    const hourLabels = Array.from({length: 24}, (_,h) => h + ':00');
    const hourData   = hourLabels.map((_, h) => byHour[String(h)] || 0);
    const maxHour    = Math.max(...hourData);
    const hourCtx    = document.getElementById('hour-chart');
    if (hourCtx) {
      if (charts.hour) charts.hour.destroy();
      charts.hour = new Chart(hourCtx, {
        type: 'bar',
        data: {
          labels: hourLabels,
          datasets: [{
            label: 'Asistencias',
            data: hourData,
            backgroundColor: hourData.map(v => {
              const intensity = maxHour > 0 ? v / maxHour : 0;
              return `rgba(0,229,160,${0.15 + intensity * 0.75})`;
            }),
            borderColor: 'rgba(0,229,160,.6)',
            borderWidth: 1, borderRadius: 3,
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: {
            label: (item) => 'Asistencias: ' + item.raw,
          }}},
          scales: {
            x: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#8890c0', maxRotation: 0,
              callback: (_, i) => [6,8,10,12,14,16,18,20,22].includes(i) ? hourLabels[i] : '',
            }},
            y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#8890c0', stepSize: 1 }, beginAtZero: true },
          },
        }
      });
    }

    // ── Top miembros más asiduos ───────────────────────────────
    const topEl = document.getElementById('rep-top-members');
    if (topEl) {
      if (!topMembers.length) {
        topEl.innerHTML = '<div style="font-size:12px;color:var(--t3);text-align:center;padding:12px">Sin datos en este período</div>';
      } else {
        const maxCount = topMembers[0]?.count || 1;
        topEl.innerHTML = topMembers.map((m, i) => `
          <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--b1)">
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:900;color:var(--t3);width:22px;text-align:center">${i + 1}</div>
            <div style="width:32px;height:32px;border-radius:50%;background:var(--s3);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;overflow:hidden">
              ${m.avatar ? `<img src="${m.avatar}" style="width:100%;height:100%;object-fit:cover">` : m.member_name[0]}
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.member_name}</div>
              <div style="height:4px;background:var(--s3);border-radius:2px;margin-top:4px">
                <div style="height:100%;width:${Math.round(m.count/maxCount*100)}%;background:var(--cyan);border-radius:2px;transition:width .4s"></div>
              </div>
            </div>
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:800;color:var(--cyan)">${m.count}</div>
          </div>`).join('');
      }
    }

  } catch(e) { toast('Error en reportes: ' + e.message, 'er'); }
}