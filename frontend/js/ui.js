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


// ── View cache & loader ──────────────────────────────────────
const VIEW_CACHE = {};

async function loadView(id) {
  const content = document.getElementById('content');
  if (!content) return;

  // Already loaded — just show
  if (VIEW_CACHE[id]) {
    content.innerHTML = VIEW_CACHE[id];
    return;
  }

  // Show spinner
  content.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:200px;color:var(--t2)"><div class="loading"><div class="spin"></div>Cargando...</div></div>';

  try {
    const res = await fetch('/views/' + id + '.html?v=' + Date.now());
    if (!res.ok) throw new Error(res.status);
    const html = await res.text();
    VIEW_CACHE[id] = html;
    content.innerHTML = html;
  } catch(e) {
    content.innerHTML = '<div style="padding:40px;text-align:center;color:var(--red)">Error cargando vista: ' + e.message + '</div>';
  }
}


// ── Sidebar toggle (mobile) ──────────────────────────────────
function toggleSidebar() {
  const sb  = document.getElementById('sb');
  const bd  = document.getElementById('sb-backdrop');
  const open = sb.classList.contains('sb-open');
  if (open) { closeSidebar(); } else { openSidebar(); }
}
function openSidebar() {
  document.getElementById('sb').classList.add('sb-open');
  document.getElementById('sb-backdrop').classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  document.getElementById('sb').classList.remove('sb-open');
  document.getElementById('sb-backdrop').classList.remove('show');
  document.body.style.overflow = '';
}

function nav(id) {
  // Close sidebar on mobile when navigating
  if (window.innerWidth <= 640) closeSidebar();
  // Update sidebar active state
  document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.sb-item[data-view="' + id + '"]').forEach(i => i.classList.add('active'));

  // Update topbar title
  const [title, sub] = VIEWS[id] || [id, ''];
  document.getElementById('tb-title').textContent = title;
  document.getElementById('tb-sub').textContent   = sub;

  // Load view HTML then trigger data load
  loadView(id).then(() => {
    // Reset scroll
    const content = document.getElementById('content');
    if (content) content.scrollTop = 0;
    // Trigger data load
    if (id === 'dashboard')     renderDashboard();
    if (id === 'attendance')    renderTodayLog();
    if (id === 'members')       loadAndRenderMembers();
    if (id === 'memberships')   loadAndRenderMs();
    if (id === 'payments')      loadAndRenderPay();
    if (id === 'reports')       setTimeout(renderReports, 120);
    if (id === 'announcements') loadAndRenderAnn();
    if (id === 'promotions')    loadPromotions();
    if (id === 'settings')      loadSettings();
    if (id === 'register')      initRegWizard();
    if (id === 'profiles')      loadAndRenderProfiles();
  });
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
  let t = document.getElementById('toast');
  // If toast container not found, create it
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  const el = document.createElement('div');
  el.className = 'ti ' + type;
  el.textContent = msg;
  t.appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transition='.3s'; setTimeout(()=>el.remove(),300); }, dur);
}