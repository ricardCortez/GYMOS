// ══════════════════════════════════════════════════════════════
//  SERVER PING
// ══════════════════════════════════════════════════════════════
async function pingServer() {
  try {
    await fetch(window.location.origin + '/api/settings', { signal: AbortSignal.timeout(2000) });
    setApiStatus(true);
    return true;
  } catch {
    setApiStatus(false);
    return false;
  }
}

function setApiStatus(ok) {
  const pill = document.getElementById('api-pill');
  const dot  = document.getElementById('sys-dot');
  const txt  = document.getElementById('sys-txt');
  if (ok) {
    pill.className = 'tb-pill ok'; pill.textContent = '● Servidor OK';
    dot.className = 'dot dot-green'; txt.textContent = 'Sistema activo';
  } else {
    pill.className = 'tb-pill err'; pill.textContent = '● Sin servidor';
    dot.className = 'dot dot-red'; txt.textContent = 'Servidor desconectado';
  }
}

async function checkFaceStatus() {
  try {
    const s = await POST('/face/status', {});
    const pill = document.getElementById('face-pill');
    if (s.available) {
      pill.className = 'tb-pill ok';
      pill.textContent = `✓ IA Facial (${s.registered_count} miembros)`;
    } else {
      pill.className = 'tb-pill warn';
      pill.textContent = '⚠ IA No disponible';
    }
  } catch {}
}

// ══════════════════════════════════════════════════════════════
//  CLOCK
// ══════════════════════════════════════════════════════════════
const DAYS  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MONTHS= ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
function tick() {
  const n = new Date();
  document.getElementById('sb-clock').textContent =
    n.getHours().toString().padStart(2,'0') + ':' + n.getMinutes().toString().padStart(2,'0');
  document.getElementById('sb-date').textContent =
    DAYS[n.getDay()] + ' ' + n.getDate() + ' ' + MONTHS[n.getMonth()];
  if (n.getSeconds() === 0) checkScheduledAnn(n);
}

// ══════════════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════════════
const VIEWS = {
  dashboard:     ['Dashboard','Resumen general'],
  attendance:    ['Asistencia','Check-in por reconocimiento facial'],
  register:      ['Nuevo Miembro','Registro con membresía y reconocimiento facial'],
  members:       ['Miembros','Gestión de clientes'],
  memberships:   ['Membresías','Planes y contratos activos'],
  payments:      ['Pagos','Historial de cobros'],
  announcements: ['Anuncios','Mensajes de voz programados'],
  promotions:    ['Promociones','Descuentos y ofertas por tiempo limitado'],
  reports:       ['Reportes','Estadísticas y análisis'],
  settings:      ['Configuración','Ajustes del sistema'],
};

function nav(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('active'));
  const vEl = document.getElementById('view-' + id);
  if (vEl) vEl.classList.add('active');
  document.querySelectorAll('.sb-item[data-view="' + id + '"]').forEach(i => i.classList.add('active'));
  const [title, sub] = VIEWS[id] || [id, ''];
  document.getElementById('tb-title').textContent = title;
  document.getElementById('tb-sub').textContent = sub;
  // Load data
  if (id === 'dashboard')   renderDashboard();
  if (id === 'attendance')  { renderTodayLog(); if (camStream) {} }
  if (id === 'members')     loadAndRenderMembers();
  if (id === 'memberships') loadAndRenderMs();
  if (id === 'payments')    loadAndRenderPay();
  if (id === 'reports')     setTimeout(renderReports, 120);
  if (id === 'announcements') loadAndRenderAnn();
  if (id === 'promotions')   loadPromotions();
  if (id === 'settings')    loadSettings();
  if (id === 'register')    initRegWizard();
}

document.querySelectorAll('.sb-item[data-view]').forEach(el =>
  el.addEventListener('click', () => nav(el.dataset.view))
);

// ══════════════════════════════════════════════════════════════
//  MODAL
// ══════════════════════════════════════════════════════════════
function openModal(title, body, actions=[], wide=false) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('modal-box').className = 'modal' + (wide?' wide':'');
  document.getElementById('modal-foot').innerHTML =
    `<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>` +
    actions.map((a,i)=>`<button class="btn ${a.cls||'btn-ghost'}" id="ma${i}">${a.label}</button>`).join('');
  actions.forEach((a,i) => document.getElementById('ma'+i).addEventListener('click', a.fn));
  document.getElementById('overlay').classList.add('open');
}
function closeModal() {
  document.getElementById('overlay').classList.remove('open');
  stopQFCam();
}
document.getElementById('overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('overlay')) closeModal();
});

// ══════════════════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════════════════
function toast(msg, type='in', dur=3500) {
  const t = document.getElementById('toast');
  const el = document.createElement('div');
  el.className = 'ti ' + type; el.textContent = msg;
  t.appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transition='.3s'; setTimeout(()=>el.remove(),300); }, dur);
}