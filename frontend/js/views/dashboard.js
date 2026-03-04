// ══════════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════════
let dashChartInst = null;

async function renderDashboard() {
  try {
    const [stats, todayAtt, attStats, msList] = await Promise.all([
      GET('/dashboard'),
      GET('/attendance/today'),
      GET('/attendance/stats?days=7'),
      GET('/memberships?active_only=true'),
    ]);

    // KPIs
    document.getElementById('dash-kpis').innerHTML = `
      <div class="kpi" style="--kpi-c:var(--cyan)">
        <div class="kpi-val">${stats.today_checkins}</div>
        <div class="kpi-lbl">Check-ins Hoy</div>
        <div class="kpi-sub">↑ En tiempo real</div>
      </div>
      <div class="kpi" style="--kpi-c:var(--green)">
        <div class="kpi-val">${stats.active_ms}</div>
        <div class="kpi-lbl">Membresías Activas</div>
        <div class="kpi-sub">${stats.expiring_soon} vencen esta semana</div>
      </div>
      <div class="kpi" style="--kpi-c:var(--yellow)">
        <div class="kpi-val">${stats.total_members}</div>
        <div class="kpi-lbl">Total Miembros</div>
        <div class="kpi-sub">${stats.face_registered} con reconocimiento facial</div>
      </div>
      <div class="kpi" style="--kpi-c:var(--orange)">
        <div class="kpi-val">${CFG.currency}${(stats.month_revenue||0).toLocaleString()}</div>
        <div class="kpi-lbl">Ingresos del Mes</div>
        <div class="kpi-sub">Mes actual</div>
      </div>
    `;

    // Recent checkins
    document.getElementById('sb-today').textContent = stats.today_checkins;
    const ci = document.getElementById('dash-checkins');
    if (!todayAtt.length) {
      ci.innerHTML = '<div class="empty"><div class="eico">🏃</div><div class="etxt">Sin check-ins hoy</div></div>';
    } else {
      ci.innerHTML = '<div style="padding:0 6px">' +
        todayAtt.slice(0,8).map(a => attRow(a)).join('') + '</div>';
    }

    // Renewals
    const renEl = document.getElementById('dash-renewals');
    const expiring = msList.filter(ms => ms.days_left >= 0 && ms.days_left <= 7);
    if (!expiring.length) {
      renEl.innerHTML = '<div class="empty" style="padding:16px"><div class="eico">✅</div><div class="etxt">Sin renovaciones urgentes</div></div>';
    } else {
      renEl.innerHTML = expiring.map(ms => `
        <div class="att-row">
          <div class="att-time" style="color:${ms.days_left<=2?'var(--red)':'var(--yellow)'};font-size:18px">${ms.days_left}d</div>
          <div style="flex:1"><div style="font-weight:600;font-size:13px">${ms.member_name}</div><div style="font-size:11px;color:var(--t2)">${ms.plan_name} • vence ${ms.end_date}</div></div>
          <button class="btn btn-ghost btn-sm" onclick="openRenewModal('${ms.id}')">Renovar</button>
        </div>`).join('');
    }

    // Chart
    const labels = [], data = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0,10);
      labels.push(DAYS[d.getDay()]);
      data.push(attStats[ds] || 0);
    }
    const ctx = document.getElementById('dash-chart');
    if (dashChartInst) dashChartInst.destroy();
    dashChartInst = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: 'rgba(255,107,0,.6)', borderColor: 'var(--orange)', borderWidth: 2, borderRadius: 5 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
        scales:{ x:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#8890c0'}},
                 y:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#8890c0',stepSize:1}}}}
    });

  } catch(e) { toast('Error cargando dashboard: ' + e.message, 'er'); }
}

function attRow(a) {
  const t  = new Date(a.check_in);
  const ts = t.getHours().toString().padStart(2,'0') + ':' + t.getMinutes().toString().padStart(2,'0');

  const methodBadge =
    a.method === 'facial'      ? '<span class="badge bb">👁 Facial</span>'      :
    a.method === 'fingerprint' ? '<span class="badge bp">🖐 Huella</span>'      :
    a.method === 'qr'          ? '<span class="badge bc">◼ QR</span>'           :
                                 '<span class="badge bgr">✍ Manual</span>';

  const deletedStyle = a.deleted ? 'opacity:.5;' : '';
  const deletedBadge = a.deleted ? '<span class="badge" style="background:rgba(239,71,111,.1);color:var(--red);border:1px solid rgba(239,71,111,.3);font-size:10px">eliminado</span>' : '';

  const avatarContent = a.member_avatar
    ? `<img src="${a.member_avatar}">`
    : `<span style="font-size:13px;color:${a.deleted ? 'var(--red)' : ''}">${a.deleted ? '✕' : (a.member_name||'?')[0]}</span>`;

  return `<div class="att-row" style="${deletedStyle}">
    <div class="att-time">${ts}</div>
    <div class="att-av" style="${a.deleted ? 'border-color:rgba(239,71,111,.3);background:rgba(239,71,111,.08)' : ''}">${avatarContent}</div>
    <div style="flex:1;min-width:0">
      <div style="font-weight:600;font-size:13px;display:flex;align-items:center;gap:6px">
        ${a.member_name} ${deletedBadge}
      </div>
      <div style="font-size:11px;color:var(--t2)">${a.plan||'—'}</div>
    </div>
    ${methodBadge}
  </div>`;
}